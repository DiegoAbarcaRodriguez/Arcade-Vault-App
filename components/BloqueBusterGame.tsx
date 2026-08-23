"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  GameComponentProps,
  GameHandle,
  GameHudState,
} from "@/components/games/registry";
import { loadSkin, saveSkin, type Skin } from "@/lib/games/skins";
import SkinSelector from "@/components/games/SkinSelector";

// Resolución lógica fija del juego (mismo tablero 4:3 nativo del original).
const W = 800;
const H = 600;

type BlockColor =
  "red" | "yellow" | "cyan" | "magenta" | "hotpink" | "green" | "gray";

/**
 * Roles de color que necesita el motor de Bloque Buster. Los bloques,
 * paddle y bola se dibujan desde un spritesheet PNG (no hay
 * ctx.fillStyle/strokeStyle por pieza), así que en vez de reinventar el
 * arte, `spriteFilter` es un CSS `ctx.filter` aplicado a esos dibujos
 * (retinte del PNG completo sin tocar el archivo de assets); el resto de
 * roles sí son literales directos como en los demás juegos.
 */
interface BloqueBusterPalette {
  background: string; // fondo del canvas (fillRect de cada frame)
  hudText: string; // texto del HUD (score/nivel), y color de las vidas
  overlayDim: string; // rgba del velo semitransparente de GAME OVER/PAUSADO/WIN
  overlayText: string; // texto del mensaje central del overlay
  spriteFilter: string; // ctx.filter aplicado a bloques/paddle/bola/explosiones
  glowBlur: number; // shadowBlur aplicado a sprites y texto de HUD/overlay
  glowColor: string; // shadowColor de ese glow
}

// `clasico` es el look original del juego (spec 08): los mismos literales
// ("#000", "#fff", "rgba(0,0,0,0.6)") que ya estaban hardcodeados en
// draw()/drawOverlay() antes de este cambio, solo movidos a esta
// estructura — no es un rediseño. spriteFilter "none" preserva el PNG tal
// cual, sin retinte.
const SKINS: Record<Skin, BloqueBusterPalette> = {
  clasico: {
    background: "#000000",
    hudText: "#ffffff",
    overlayDim: "rgba(0, 0, 0, 0.6)",
    overlayText: "#ffffff",
    spriteFilter: "none",
    glowBlur: 0,
    glowColor: "transparent",
  },
  // Fósforo verde de monitor CRT de 8-bit: el spritesheet a color se
  // retiñe a monocromo verde vía ctx.filter (grayscale + sepia +
  // hue-rotate es el truco estándar para lograr un verde fósforo sin
  // generar arte nuevo), con glow para que no quede plano sobre el negro.
  retro: {
    background: "#000000",
    hudText: "#33ff33",
    overlayDim: "rgba(0, 20, 0, 0.65)",
    overlayText: "#33ff33",
    spriteFilter:
      "grayscale(1) sepia(1) hue-rotate(70deg) saturate(3.2) brightness(1.05)",
    glowBlur: 10,
    glowColor: "#33ff33",
  },
  // Synthwave/arcade neón: mismo spritesheet pero con saturación y brillo
  // elevados (mantiene los colores originales de cada bloque, pero más
  // vívidos), fondo casi negro con leve tinte violeta y HUD en
  // cyan/magenta coherentes con --cyan/--magenta de app/globals.css.
  neon: {
    background: "#05010f",
    hudText: "#00f5ff",
    overlayDim: "rgba(10, 0, 20, 0.65)",
    overlayText: "#ff006e",
    spriteFilter: "saturate(1.9) brightness(1.15) contrast(1.1)",
    glowBlur: 8,
    glowColor: "#00f5ff",
  },
};

/**
 * Port de resources/04-arkanoid/{game.js,levels.js,assets/spritesheet.js}.
 * Los 3 scripts globales del original se unifican acá dentro de un solo
 * useEffect: todo el estado del motor (paddle, ball, blocks, explosions,
 * LEVELS, el spritesheet cacheado) vive encapsulado por instancia, sin
 * globals compartidos entre montajes.
 */
const BloqueBusterGame = forwardRef<GameHandle, GameComponentProps>(
  function BloqueBusterGame({ onHudChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Ref para que el loop siempre invoque el callback más reciente sin
    // tener que reiniciar el motor cuando el padre pasa una nueva función.
    const onHudChangeRef = useRef(onHudChange);
    useEffect(() => {
      onHudChangeRef.current = onHudChange;
    }, [onHudChange]);

    // Los métodos reales se asignan dentro del useEffect (cierran sobre el
    // estado mutable del motor); este ref los expone hacia afuera sin tener
    // que reiniciar el motor cuando el componente padre se re-renderiza.
    const controlsRef = useRef<GameHandle>({
      togglePause: () => {},
      forceGameOver: () => {},
    });
    useImperativeHandle(ref, () => ({
      togglePause: () => controlsRef.current.togglePause(),
      forceGameOver: () => controlsRef.current.forceGameOver(),
      setSkin: handleSkinChange,
    }));

    // Skin activa: estado de React (para el <select>, y para persistirla)
    // más un ref (para que el loop del motor, que corre dentro de un
    // useEffect con deps vacías, siempre lea la paleta más reciente sin
    // que cambiar de skin reinicie la partida en curso).
    const [skin, setSkin] = useState<Skin>(() => loadSkin("bloque-buster"));
    const paletteRef = useRef<BloqueBusterPalette>(SKINS[skin]);
    const skinRef = useRef<Skin>(skin);
    useEffect(() => {
      paletteRef.current = SKINS[skin];
      skinRef.current = skin;
    }, [skin]);

    const handleSkinChange = (next: Skin) => {
      setSkin(next);
      saveSkin("bloque-buster", next);
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let cancelled = false;

      // ── Spritesheet (assets/spritesheet.js, aislado por instancia) ──────
      interface SpriteFrame {
        sx: number;
        sy: number;
        sw: number;
        sh: number;
      }
      const SPRITES: {
        paddle: SpriteFrame;
        ball: SpriteFrame;
        blocks: Record<BlockColor, SpriteFrame>;
      } = {
        paddle: { sx: 32, sy: 112, sw: 162, sh: 14 },
        ball: { sx: 32, sy: 32, sw: 16, sh: 16 },
        blocks: {
          gray: { sx: 32, sy: 288, sw: 32, sh: 16 },
          red: { sx: 32, sy: 176, sw: 32, sh: 16 },
          yellow: { sx: 32, sy: 240, sw: 32, sh: 16 },
          cyan: { sx: 32, sy: 192, sw: 32, sh: 16 },
          magenta: { sx: 32, sy: 224, sw: 32, sh: 16 },
          hotpink: { sx: 32, sy: 256, sw: 32, sh: 16 },
          green: { sx: 32, sy: 208, sw: 32, sh: 16 },
        },
      };
      const EXPLOSION_FRAMES: Record<BlockColor, SpriteFrame[]> = {
        red: [
          { sx: 256, sy: 176, sw: 32, sh: 16 },
          { sx: 288, sy: 176, sw: 32, sh: 16 },
          { sx: 320, sy: 176, sw: 32, sh: 16 },
          { sx: 352, sy: 176, sw: 32, sh: 16 },
        ],
        cyan: [
          { sx: 256, sy: 192, sw: 32, sh: 16 },
          { sx: 288, sy: 192, sw: 32, sh: 16 },
          { sx: 320, sy: 192, sw: 32, sh: 16 },
          { sx: 352, sy: 192, sw: 32, sh: 16 },
        ],
        green: [
          { sx: 256, sy: 208, sw: 32, sh: 16 },
          { sx: 288, sy: 208, sw: 32, sh: 16 },
          { sx: 320, sy: 208, sw: 32, sh: 16 },
          { sx: 352, sy: 208, sw: 32, sh: 16 },
        ],
        magenta: [
          { sx: 256, sy: 224, sw: 32, sh: 16 },
          { sx: 288, sy: 224, sw: 32, sh: 16 },
          { sx: 320, sy: 224, sw: 32, sh: 16 },
          { sx: 352, sy: 224, sw: 32, sh: 16 },
        ],
        yellow: [
          { sx: 256, sy: 240, sw: 32, sh: 16 },
          { sx: 288, sy: 240, sw: 32, sh: 16 },
          { sx: 320, sy: 240, sw: 32, sh: 16 },
          { sx: 352, sy: 240, sw: 32, sh: 16 },
        ],
        hotpink: [
          { sx: 256, sy: 256, sw: 32, sh: 16 },
          { sx: 288, sy: 256, sw: 32, sh: 16 },
          { sx: 320, sy: 256, sw: 32, sh: 16 },
          { sx: 352, sy: 256, sw: 32, sh: 16 },
        ],
        gray: [
          { sx: 256, sy: 176, sw: 32, sh: 16 },
          { sx: 288, sy: 176, sw: 32, sh: 16 },
          { sx: 320, sy: 176, sw: 32, sh: 16 },
          { sx: 352, sy: 176, sw: 32, sh: 16 },
        ],
      };
      const EXPLOSION_DURATION = 150;

      let ssImg: HTMLCanvasElement | null = null;
      let ssLoaded = false;

      function drawFrame(
        frame: SpriteFrame,
        x: number,
        y: number,
        w: number,
        h: number,
      ) {
        if (!ssLoaded || !ssImg) return;
        ctx!.drawImage(
          ssImg,
          frame.sx,
          frame.sy,
          frame.sw,
          frame.sh,
          x,
          y,
          w,
          h,
        );
      }
      function drawSprite(
        name: string,
        x: number,
        y: number,
        w: number,
        h: number,
      ) {
        if (!ssLoaded || !ssImg) return;
        const sp: SpriteFrame | undefined = name.startsWith("block_")
          ? SPRITES.blocks[name.slice(6) as BlockColor]
          : name === "paddle"
            ? SPRITES.paddle
            : name === "ball"
              ? SPRITES.ball
              : undefined;
        if (!sp) return;
        ctx!.drawImage(ssImg, sp.sx, sp.sy, sp.sw, sp.sh, x, y, w, h);
      }
      function loadSpritesheet(onLoaded: () => void) {
        const rawImg = new Image();
        rawImg.onload = () => {
          if (cancelled) return;
          const oc = document.createElement("canvas");
          oc.width = rawImg.width;
          oc.height = rawImg.height;
          const octx = oc.getContext("2d");
          if (octx) {
            octx.drawImage(rawImg, 0, 0);
            ssImg = oc;
            ssLoaded = true;
          }
          onLoaded();
        };
        rawImg.onerror = () => console.error("Failed to load spritesheet");
        rawImg.src = "/games/bloque-buster/spritesheet-breakout.png";
      }

      // ── Niveles (levels.js) ──────────────────────────────────────────────
      interface LevelBlockDef {
        col: number;
        row: number;
        color: BlockColor;
      }
      interface LevelDef {
        speed: number;
        blocks: LevelBlockDef[];
      }
      const LEVELS: LevelDef[] = (() => {
        const rowColors1: BlockColor[] = [
          "red",
          "yellow",
          "cyan",
          "magenta",
          "hotpink",
          "green",
        ];
        const rowColors2: BlockColor[] = [
          "gray",
          "cyan",
          "hotpink",
          "yellow",
          "magenta",
          "green",
        ];
        const rowColors4: BlockColor[] = [
          "cyan",
          "magenta",
          "green",
          "yellow",
          "hotpink",
          "red",
        ];

        const l1: LevelBlockDef[] = [];
        for (let row = 0; row < 6; row++)
          for (let col = 0; col < 10; col++)
            l1.push({ col, row, color: rowColors1[row] });

        const l2: LevelBlockDef[] = [];
        const pyStart = [4, 3, 2, 1, 0, 0];
        const pyEnd = [5, 6, 7, 8, 9, 9];
        for (let row = 0; row < 6; row++)
          for (let col = pyStart[row]; col <= pyEnd[row]; col++)
            l2.push({ col, row, color: rowColors2[row] });

        const l3: LevelBlockDef[] = [];
        for (let row = 0; row < 6; row++)
          for (let col = 0; col < 10; col++)
            if ((col + row) % 2 === 0)
              l3.push({ col, row, color: row < 3 ? "yellow" : "magenta" });

        const gaps4 = [
          [2, 5, 8],
          [0, 4, 7, 9],
          [1, 3, 6],
          [2, 5, 8, 9],
          [0, 4, 7],
          [1, 3, 6, 9],
        ];
        const l4: LevelBlockDef[] = [];
        for (let row = 0; row < 6; row++)
          for (let col = 0; col < 10; col++)
            if (!gaps4[row].includes(col))
              l4.push({ col, row, color: rowColors4[row] });

        const l5: LevelBlockDef[] = [];
        for (let row = 0; row < 6; row++)
          for (let col = 0; col < 10; col++) {
            const isFrame = col === 0 || col === 9 || row === 0 || row === 5;
            const isCross = col === 4 || row === 2;
            if (isFrame || isCross)
              l5.push({
                col,
                row,
                color: isCross && !isFrame ? "hotpink" : "cyan",
              });
          }

        return [
          { speed: 1.0, blocks: l1 },
          { speed: 1.1, blocks: l2 },
          { speed: 1.21, blocks: l3 },
          { speed: 1.33, blocks: l4 },
          { speed: 1.46, blocks: l5 },
        ];
      })();

      // ── Constantes del motor (game.js) ──────────────────────────────────
      const PADDLE_SPEED = 400;
      const BLOCK_COLS = 10;
      const BLOCK_W = 64;
      const BLOCK_H = 24;
      const BLOCKS_ORIGIN_X = (W - BLOCK_COLS * BLOCK_W) / 2;
      const BLOCKS_ORIGIN_Y = 80;
      const BASE_BALL_VX = 200;
      const BASE_BALL_VY = -300;

      // ── Estado mutable del motor ─────────────────────────────────────────
      interface Block {
        x: number;
        y: number;
        w: number;
        h: number;
        color: BlockColor;
        alive: boolean;
      }
      interface Explosion {
        x: number;
        y: number;
        w: number;
        h: number;
        color: BlockColor;
        elapsed: number;
      }

      const paddle = { x: 0, y: 560, w: 81, h: 14 };
      const ball = { x: 0, y: 0, w: 16, h: 16, vx: 200, vy: -300 };
      let blocks: Block[] = [];
      let explosions: Explosion[] = [];
      let lives = 3;
      let score = 0;
      let currentLevel = 1;
      let gameState: "playing" | "paused" | "gameover" | "win" = "playing";

      // ── Sonidos ───────────────────────────────────────────────────────────
      const bounceSound = new Audio("/games/bloque-buster/ball-bounce.mp3");
      const breakSound = new Audio("/games/bloque-buster/break-sound.mp3");
      function playSound(sound: HTMLAudioElement) {
        const node = sound.cloneNode() as HTMLAudioElement;
        node.play().catch(() => {});
      }

      // ── Input: teclado ────────────────────────────────────────────────────
      const keys = { ArrowLeft: false, ArrowRight: false };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
        e.preventDefault();
        keys[e.code] = true;
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
        e.preventDefault();
        keys[e.code] = false;
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      // ── Input: mouse + touch, escuchados sobre el propio canvas (no en
      // window) porque necesitan getBoundingClientRect() del canvas para
      // escalar coordenadas de puntero/dedo a las coordenadas lógicas
      // 800×600 del tablero. ───────────────────────────────────────────────
      function movePaddleToClientX(clientX: number) {
        const rect = canvas!.getBoundingClientRect();
        const scaleX = canvas!.width / rect.width;
        const mx = (clientX - rect.left) * scaleX;
        paddle.x = Math.max(0, Math.min(W - paddle.w, mx - paddle.w / 2));
      }
      const handleMouseMove = (e: MouseEvent) => movePaddleToClientX(e.clientX);
      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) movePaddleToClientX(touch.clientX);
      };
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
      canvas.addEventListener("touchstart", handleTouchMove, {
        passive: false,
      });

      // ── Init ──────────────────────────────────────────────────────────────
      function initPaddle() {
        paddle.x = (W - paddle.w) / 2;
      }
      function initBall() {
        const speed = LEVELS[currentLevel - 1].speed;
        ball.x = paddle.x + (paddle.w - ball.w) / 2;
        ball.y = paddle.y - ball.h;
        ball.vx = BASE_BALL_VX * speed;
        ball.vy = BASE_BALL_VY * speed;
      }
      function loadLevel(n: number) {
        currentLevel = n;
        const level = LEVELS[n - 1];
        blocks = level.blocks.map((b) => ({
          x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
          y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
          w: BLOCK_W,
          h: BLOCK_H,
          color: b.color,
          alive: true,
        }));
        explosions = [];
        initBall();
      }
      function initGame() {
        lives = 3;
        score = 0;
        gameState = "playing";
        initPaddle();
        loadLevel(1);
      }

      function collideAABB(block: Block) {
        return (
          ball.x < block.x + block.w &&
          ball.x + ball.w > block.x &&
          ball.y < block.y + block.h &&
          ball.y + ball.h > block.y
        );
      }

      // ── Update ────────────────────────────────────────────────────────────
      function update(dt: number) {
        // "paused"/"gameover"/"win" congelan la física; draw() sigue corriendo.
        if (gameState !== "playing") return;

        if (keys.ArrowLeft)
          paddle.x = Math.max(0, paddle.x - PADDLE_SPEED * dt);
        if (keys.ArrowRight)
          paddle.x = Math.min(W - paddle.w, paddle.x + PADDLE_SPEED * dt);

        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x <= 0) {
          ball.x = 0;
          ball.vx = Math.abs(ball.vx);
          playSound(bounceSound);
        }
        if (ball.x + ball.w >= W) {
          ball.x = W - ball.w;
          ball.vx = -Math.abs(ball.vx);
          playSound(bounceSound);
        }
        if (ball.y <= 0) {
          ball.y = 0;
          ball.vy = Math.abs(ball.vy);
          playSound(bounceSound);
        }

        if (
          ball.vy > 0 &&
          ball.x + ball.w > paddle.x &&
          ball.x < paddle.x + paddle.w &&
          ball.y + ball.h >= paddle.y &&
          ball.y + ball.h <= paddle.y + paddle.h + 8
        ) {
          ball.y = paddle.y - ball.h;
          ball.vy = -Math.abs(ball.vy);
          playSound(bounceSound);
        }

        for (const block of blocks) {
          if (!block.alive) continue;
          if (collideAABB(block)) {
            block.alive = false;
            explosions.push({
              x: block.x,
              y: block.y,
              w: block.w,
              h: block.h,
              color: block.color,
              elapsed: 0,
            });
            score += 10;
            ball.vy = -ball.vy;
            playSound(breakSound);
            if (blocks.every((b) => !b.alive)) {
              if (currentLevel < 5) loadLevel(currentLevel + 1);
              else gameState = "win";
            }
            break; // un bloque por frame
          }
        }

        for (const exp of explosions) exp.elapsed += dt * 1000;
        explosions = explosions.filter(
          (exp) => exp.elapsed < EXPLOSION_DURATION,
        );

        if (ball.y > H) {
          lives--;
          if (lives <= 0) {
            lives = 0;
            gameState = "gameover";
          } else {
            initBall();
          }
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      function drawOverlay(message: string) {
        const palette = paletteRef.current;
        ctx!.filter = "none";
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = palette.overlayDim;
        ctx!.fillRect(0, 0, W, H);
        ctx!.fillStyle = palette.overlayText;
        ctx!.font = "bold 64px monospace";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.shadowBlur = palette.glowBlur;
        ctx!.shadowColor = palette.glowColor;
        ctx!.fillText(message, W / 2, H / 2);
        ctx!.shadowBlur = 0;
      }

      function draw() {
        const palette = paletteRef.current;
        ctx!.filter = "none";
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = palette.background;
        ctx!.fillRect(0, 0, W, H);

        // Bloques/paddle/bola/explosiones vienen de un spritesheet PNG: en
        // vez de redibujar arte por skin, se retiñe el dibujo completo con
        // ctx.filter (más shadowBlur/shadowColor de glow) — "none"/0 en
        // clasico deja el PNG exactamente como está.
        ctx!.filter = palette.spriteFilter;
        ctx!.shadowBlur = palette.glowBlur;
        ctx!.shadowColor = palette.glowColor;

        for (const block of blocks) {
          if (block.alive)
            drawSprite(
              "block_" + block.color,
              block.x,
              block.y,
              block.w,
              block.h,
            );
        }

        for (const exp of explosions) {
          const frameIndex = Math.min(
            Math.floor((exp.elapsed / EXPLOSION_DURATION) * 4),
            3,
          );
          drawFrame(
            EXPLOSION_FRAMES[exp.color][frameIndex],
            exp.x,
            exp.y,
            exp.w,
            exp.h,
          );
        }

        drawSprite("paddle", paddle.x, paddle.y, paddle.w, paddle.h);
        drawSprite("ball", ball.x, ball.y, ball.w, ball.h);

        ctx!.filter = "none";
        ctx!.shadowBlur = 0;

        if (gameState === "playing" || gameState === "paused") {
          ctx!.fillStyle = palette.hudText;
          ctx!.font = "bold 18px monospace";
          ctx!.textAlign = "left";
          ctx!.textBaseline = "top";
          ctx!.fillText("Score: " + score, 10, 10);
          ctx!.textAlign = "center";
          ctx!.fillText("Nivel: " + currentLevel, W / 2, 10);
          const ballSize = 16;
          const ballSpacing = 4;
          ctx!.filter = palette.spriteFilter;
          ctx!.shadowBlur = palette.glowBlur;
          ctx!.shadowColor = palette.glowColor;
          for (let i = 0; i < lives; i++) {
            const bx = W - 10 - (lives - i) * (ballSize + ballSpacing);
            drawSprite("ball", bx, 10, ballSize, ballSize);
          }
          ctx!.filter = "none";
          ctx!.shadowBlur = 0;
        }

        if (gameState === "gameover") drawOverlay("GAME OVER");
        if (gameState === "win") drawOverlay("¡Completaste el juego!");
        if (gameState === "paused") drawOverlay("PAUSADO");
      }

      // ── HUD externo ───────────────────────────────────────────────────────
      // Se reporta hacia afuera solo cuando algún valor relevante cambia, no
      // en cada frame, para no forzar renders de React a 60fps. "win" y
      // "gameover" del motor mapean ambos a phase: "gameover" — es la única
      // forma de que completar el juego también dispare el modal de guardado
      // de puntaje de GamePlayer.
      let lastHud: GameHudState | null = null;
      function reportHud() {
        const phase: GameHudState["phase"] =
          gameState === "paused"
            ? "paused"
            : gameState === "playing"
              ? "playing"
              : "gameover";
        const next: GameHudState = {
          score,
          lives,
          level: currentLevel,
          phase,
          skin: skinRef.current,
        };
        if (
          !lastHud ||
          lastHud.score !== next.score ||
          lastHud.lives !== next.lives ||
          lastHud.level !== next.level ||
          lastHud.phase !== next.phase ||
          lastHud.skin !== next.skin
        ) {
          lastHud = next;
          onHudChangeRef.current?.(next);
        }
      }

      // ── Controles externos (PAUSA / FIN) ─────────────────────────────────
      // Sin overlay de pausa propio del motor: GamePlayer.tsx maneja PAUSA
      // (togglePause), FIN (forceGameOver) y pantalla completa.
      controlsRef.current.togglePause = () => {
        if (gameState === "playing") gameState = "paused";
        else if (gameState === "paused") gameState = "playing";
        reportHud();
      };

      controlsRef.current.forceGameOver = () => {
        if (gameState === "gameover" || gameState === "win") return;
        gameState = "gameover";
        reportHud();
      };

      // ── Loop principal ───────────────────────────────────────────────────
      let rafId = 0;
      let lastTime: number | null = null;

      function loop(ts: number) {
        const dt =
          lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;
        update(dt);
        draw();
        reportHud();
        rafId = requestAnimationFrame(loop);
      }

      initGame();
      reportHud();
      loadSpritesheet(() => {
        if (cancelled) return;
        rafId = requestAnimationFrame(loop);
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        canvas.removeEventListener("mousemove", handleMouseMove);
        canvas.removeEventListener("touchmove", handleTouchMove);
        canvas.removeEventListener("touchstart", handleTouchMove);
      };
    }, []);

    return (
      <div className="game-arena game-arena-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
        <div className="game-skin-panel">
          <SkinSelector value={skin} onChange={handleSkinChange} />
        </div>
      </div>
    );
  },
);

export default BloqueBusterGame;
