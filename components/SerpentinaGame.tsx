"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type {
  GameComponentProps,
  GameHandle,
  GameHudState,
} from "@/components/games/registry";

// Resolución lógica fija del tablero (canvas único 4:3 nativo, sin
// letterboxing ni segundo canvas — a diferencia de Tetris).
const W = 800;
const H = 600;

// Grilla 32×24 sobre el canvas 800×600 → celdas de 25×25px.
const COLS = 32;
const ROWS = 24;
const CELL = 25;

interface Point {
  x: number; // columna (0–31)
  y: number; // fila (0–23)
}

interface FruitSprite {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Atlas de las 22 frutas, portado tal cual desde
// resources/snake-assets/sprites.js (window.SPRITE_ATLAS.fruits) para
// evitar errores de transcripción en los offsets x/y/w/h.
const FRUIT_ATLAS: Record<string, FruitSprite> = {
  banana: { x: 34, y: 136, w: 110, h: 160 },
  orange: { x: 186, y: 136, w: 150, h: 160 },
  grape: { x: 378, y: 136, w: 110, h: 160 },
  garlic: { x: 540, y: 136, w: 130, h: 160 },
  eggplant: { x: 712, y: 136, w: 130, h: 160 },
  strawberry: { x: 894, y: 136, w: 110, h: 160 },
  cherry: { x: 1066, y: 136, w: 110, h: 160 },
  carrot: { x: 1228, y: 136, w: 130, h: 160 },
  mushroom: { x: 1400, y: 136, w: 130, h: 160 },
  broccoli: { x: 1582, y: 136, w: 110, h: 160 },
  watermelon: { x: 1734, y: 136, w: 150, h: 160 },
  pepper: { x: 1906, y: 136, w: 150, h: 160 },
  kiwi: { x: 2068, y: 136, w: 170, h: 160 },
  lemon: { x: 2250, y: 136, w: 140, h: 160 },
  peach: { x: 2432, y: 136, w: 130, h: 160 },
  peanut: { x: 2604, y: 136, w: 130, h: 160 },
  apple: { x: 2786, y: 136, w: 110, h: 160 },
  tomato: { x: 2948, y: 136, w: 130, h: 160 },
  berries: { x: 3110, y: 136, w: 150, h: 160 },
  grapes2: { x: 3302, y: 136, w: 110, h: 160 },
  pineapple: { x: 3454, y: 136, w: 150, h: 160 },
  melon: { x: 3637, y: 136, w: 130, h: 160 },
};
const FRUIT_NAMES = Object.keys(FRUIT_ATLAS);

type Direction = "up" | "down" | "left" | "right";

const DIR_DELTA: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const FRUIT_POINTS = 10;
const FRUITS_PER_LEVEL = 5;
const INITIAL_SNAKE_LENGTH = 3;
const BASE_TICK_MS = 150;
const TICK_STEP_MS = 15;
const MIN_TICK_MS = 60;

/**
 * Snake escrito desde cero (no hay prototipo en resources/, solo assets
 * visuales en resources/snake-assets/). Sigue el mismo boilerplate que
 * AsteroidsGame/BloqueBusterGame: forwardRef<GameHandle, GameComponentProps>,
 * estado del motor aislado dentro del useEffect, listeners en window.
 */
const SerpentinaGame = forwardRef<GameHandle, GameComponentProps>(
  function SerpentinaGame({ onHudChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const onHudChangeRef = useRef(onHudChange);
    useEffect(() => {
      onHudChangeRef.current = onHudChange;
    }, [onHudChange]);

    const controlsRef = useRef<GameHandle>({
      togglePause: () => {},
      forceGameOver: () => {},
    });
    useImperativeHandle(ref, () => ({
      togglePause: () => controlsRef.current.togglePause(),
      forceGameOver: () => controlsRef.current.forceGameOver(),
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let cancelled = false;

      // ── Assets ────────────────────────────────────────────────────────────
      let fruitsImg: HTMLImageElement | null = null;
      let fruitsLoaded = false;
      {
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          fruitsLoaded = true;
        };
        img.onerror = () => console.error("Failed to load fruits.png");
        img.src = "/games/serpentina/fruits.png";
        fruitsImg = img;
      }

      // ── Estado mutable del motor ─────────────────────────────────────────
      let snake: Point[] = [];
      let direction: Direction = "right";
      let nextDirection: Direction = "right";
      let fruit: { pos: Point; sprite: string } | null = null;
      let score = 0;
      let lives = 3;
      let level = 1;
      let tickMs = BASE_TICK_MS;
      let fruitsEatenTotal = 0;
      let gameState: "playing" | "paused" | "gameover" = "playing";

      function centerStart(): Point[] {
        const cy = Math.floor(ROWS / 2);
        const cx = Math.floor(COLS / 2);
        // Cuerpo horizontal, cabeza a la derecha, apuntando a "right".
        const body: Point[] = [];
        for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
          body.push({ x: cx - i, y: cy });
        }
        return body;
      }

      function randomFreeCell(): Point {
        const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
        let candidate: Point;
        do {
          candidate = {
            x: Math.floor(Math.random() * COLS),
            y: Math.floor(Math.random() * ROWS),
          };
        } while (occupied.has(`${candidate.x},${candidate.y}`));
        return candidate;
      }

      function spawnFruit() {
        const sprite =
          FRUIT_NAMES[Math.floor(Math.random() * FRUIT_NAMES.length)];
        fruit = { pos: randomFreeCell(), sprite };
      }

      function resetSnake() {
        snake = centerStart();
        direction = "right";
        nextDirection = "right";
      }

      function initGame() {
        score = 0;
        lives = 3;
        level = 1;
        tickMs = BASE_TICK_MS;
        fruitsEatenTotal = 0;
        gameState = "playing";
        resetSnake();
        spawnFruit();
      }

      // ── Input ─────────────────────────────────────────────────────────────
      const handleKeyDown = (e: KeyboardEvent) => {
        const dir = KEY_TO_DIR[e.code];
        if (!dir) return;
        e.preventDefault();
        // Se valida contra la direction real vigente al aplicar
        // nextDirection en cada tick (no acá), pero descartar temprano el
        // 180° obvio contra la última direction confirmada evita que un
        // segundo giro rápido pise el buffer con un valor inválido.
        if (dir !== OPPOSITE[direction]) nextDirection = dir;
      };
      window.addEventListener("keydown", handleKeyDown);

      // ── Tick de movimiento (desacoplado del rAF de dibujo) ───────────────
      let tickAccumulator = 0;

      function step() {
        // Aplica nextDirection solo si no es el opuesto a la direction
        // real vigente en este tick (evita el giro de 180° "colado" si el
        // jugador presionó dos teclas entre dos ticks).
        if (nextDirection !== OPPOSITE[direction]) direction = nextDirection;
        else nextDirection = direction;

        const delta = DIR_DELTA[direction];
        const head = snake[0];
        const newHead: Point = { x: head.x + delta.x, y: head.y + delta.y };

        const outOfBounds =
          newHead.x < 0 ||
          newHead.x >= COLS ||
          newHead.y < 0 ||
          newHead.y >= ROWS;
        const hitsSelf = snake.some(
          (seg) => seg.x === newHead.x && seg.y === newHead.y,
        );

        if (outOfBounds || hitsSelf) {
          lives--;
          if (lives <= 0) {
            lives = 0;
            gameState = "gameover";
          } else {
            resetSnake();
          }
          return;
        }

        snake.unshift(newHead);

        if (fruit && newHead.x === fruit.pos.x && newHead.y === fruit.pos.y) {
          score += FRUIT_POINTS;
          fruitsEatenTotal++;
          if (fruitsEatenTotal % FRUITS_PER_LEVEL === 0) {
            level++;
            tickMs = Math.max(
              MIN_TICK_MS,
              BASE_TICK_MS - (level - 1) * TICK_STEP_MS,
            );
          }
          spawnFruit();
          // no pop: la serpiente crece 1 segmento
        } else {
          snake.pop();
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      function drawOverlay(message: string) {
        ctx!.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx!.fillRect(0, 0, W, H);
        ctx!.fillStyle = "#fff";
        ctx!.font = "bold 48px monospace";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(message, W / 2, H / 2);
      }

      function drawFruit() {
        if (!fruit || !fruitsLoaded || !fruitsImg) return;
        const sprite = FRUIT_ATLAS[fruit.sprite];
        ctx!.drawImage(
          fruitsImg,
          sprite.x,
          sprite.y,
          sprite.w,
          sprite.h,
          fruit.pos.x * CELL,
          fruit.pos.y * CELL,
          CELL,
          CELL,
        );
      }

      function drawSnake() {
        ctx!.shadowBlur = 10;
        ctx!.shadowColor = "#00ff88";
        for (let i = snake.length - 1; i >= 0; i--) {
          const seg = snake[i];
          const isHead = i === 0;
          ctx!.fillStyle = isHead ? "#8dffc4" : "#00ff88";
          const px = seg.x * CELL;
          const py = seg.y * CELL;
          if (typeof ctx!.roundRect === "function") {
            ctx!.beginPath();
            ctx!.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 4);
            ctx!.fill();
          } else {
            ctx!.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          }
        }
        ctx!.shadowBlur = 0;

        // Ojos en la cabeza, orientados según direction.
        const headPx = snake[0];
        if (headPx) {
          const cx = headPx.x * CELL + CELL / 2;
          const cy = headPx.y * CELL + CELL / 2;
          const offset = CELL * 0.22;
          let e1 = { x: cx, y: cy };
          let e2 = { x: cx, y: cy };
          if (direction === "up" || direction === "down") {
            const dy = direction === "up" ? -offset : offset;
            e1 = { x: cx - offset, y: cy + dy };
            e2 = { x: cx + offset, y: cy + dy };
          } else {
            const dx = direction === "left" ? -offset : offset;
            e1 = { x: cx + dx, y: cy - offset };
            e2 = { x: cx + dx, y: cy + offset };
          }
          ctx!.fillStyle = "#04140b";
          ctx!.beginPath();
          ctx!.arc(e1.x, e1.y, 2.2, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.beginPath();
          ctx!.arc(e2.x, e2.y, 2.2, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      function drawHud() {
        ctx!.fillStyle = "#fff";
        ctx!.font = "bold 18px monospace";
        ctx!.textAlign = "left";
        ctx!.textBaseline = "top";
        ctx!.fillText("Score: " + score, 10, 10);
        ctx!.textAlign = "center";
        ctx!.fillText("Nivel: " + level, W / 2, 10);

        const heartSize = 16;
        const heartSpacing = 4;
        ctx!.fillStyle = "#ff2d55";
        for (let i = 0; i < lives; i++) {
          const hx = W - 10 - (lives - i) * (heartSize + heartSpacing);
          ctx!.beginPath();
          ctx!.arc(
            hx + heartSize * 0.28,
            10 + heartSize * 0.3,
            heartSize * 0.28,
            0,
            Math.PI * 2,
          );
          ctx!.arc(
            hx + heartSize * 0.72,
            10 + heartSize * 0.3,
            heartSize * 0.28,
            0,
            Math.PI * 2,
          );
          ctx!.moveTo(hx, 10 + heartSize * 0.35);
          ctx!.lineTo(hx + heartSize / 2, 10 + heartSize);
          ctx!.lineTo(hx + heartSize, 10 + heartSize * 0.35);
          ctx!.closePath();
          ctx!.fill();
        }
      }

      function draw() {
        ctx!.fillStyle = "#000";
        ctx!.fillRect(0, 0, W, H);

        drawFruit();
        drawSnake();

        if (gameState === "playing" || gameState === "paused") drawHud();

        if (gameState === "gameover") drawOverlay("GAME OVER");
        if (gameState === "paused") drawOverlay("PAUSADO");
      }

      // ── HUD externo ───────────────────────────────────────────────────────
      let lastHud: GameHudState | null = null;
      function reportHud() {
        const phase: GameHudState["phase"] =
          gameState === "paused"
            ? "paused"
            : gameState === "playing"
              ? "playing"
              : "gameover";
        const next: GameHudState = { score, lives, level, phase };
        if (
          !lastHud ||
          lastHud.score !== next.score ||
          lastHud.lives !== next.lives ||
          lastHud.level !== next.level ||
          lastHud.phase !== next.phase
        ) {
          lastHud = next;
          onHudChangeRef.current?.(next);
        }
      }

      // ── Controles externos (PAUSA / FIN) ─────────────────────────────────
      controlsRef.current.togglePause = () => {
        if (gameState === "playing") gameState = "paused";
        else if (gameState === "paused") gameState = "playing";
        reportHud();
      };

      controlsRef.current.forceGameOver = () => {
        if (gameState === "gameover") return;
        gameState = "gameover";
        reportHud();
      };

      // ── Loop principal ───────────────────────────────────────────────────
      // El acumulador de tick mueve la serpiente cada tickMs (no cada
      // frame); draw() corre a la tasa normal de rAF. tickMs se recalcula
      // solo al cruzar el umbral de frutas, sin reiniciar el acumulador.
      let rafId = 0;
      let lastTime: number | null = null;

      function loop(ts: number) {
        const dtMs = lastTime === null ? 0 : Math.min(ts - lastTime, 250);
        lastTime = ts;

        if (gameState === "playing") {
          tickAccumulator += dtMs;
          while (tickAccumulator >= tickMs) {
            tickAccumulator -= tickMs;
            step();
            if (gameState !== "playing") {
              tickAccumulator = 0;
              break;
            }
          }
        }

        draw();
        reportHud();
        rafId = requestAnimationFrame(loop);
      }

      initGame();
      reportHud();
      rafId = requestAnimationFrame(loop);

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    return (
      <div className="game-arena game-arena-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
      </div>
    );
  },
);

export default SerpentinaGame;
