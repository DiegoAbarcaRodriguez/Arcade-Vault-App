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

// Resolución lógica fija del tablero (ver spec 07): 10×20 celdas de 30px,
// igual que resources/03-tetris. El panel (HUD interno + siguiente pieza)
// vive en un segundo canvas más chico, ver Modelo de datos del spec.
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PANEL_W = 200;
const PANEL_H = 600;
const NEXT_BLOCK = 24;

/**
 * Roles de color que necesita el motor de Tetris: 8 colores de pieza
 * (índice 0 sin usar — el tablero guarda 0 como celda vacía), el
 * resaltado superior de cada bloque, la grilla del tablero, los fondos
 * de tablero/panel, el texto del panel (SCORE/LINES/LEVEL/NEXT) y el
 * overlay de pausa/game-over. Cada skin es un objeto con esta misma forma.
 */
interface TetrisPalette {
  boardBackground: string; // fondo del canvas del tablero
  panelBackground: string; // fondo del canvas del panel lateral
  gridLine: string; // líneas finas de la grilla del tablero
  pieceColors: [
    null,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]; // índice 0 nulo (celda vacía), 1-8 = I,O,T,S,Z,J,L,N
  blockHighlight: string; // franja superior clara de cada bloque
  glowBlur: number; // shadowBlur (px) aplicado a los bloques
  hudLabel: string; // etiquetas SCORE/LINES/LEVEL/NEXT del panel
  hudValue: string; // valores numéricos del panel
  overlayBg: string; // velo semitransparente de pausa/game-over
  overlayTitle: string; // título "GAME OVER"/"PAUSADO"
  overlaySub: string; // subtítulo del overlay
}

// `clasico` es el look original del juego (spec 07): los mismos literales
// que ya estaban hardcodeados en COLORS/ctx.fillStyle antes de este
// cambio, solo movidos a esta estructura — no es un rediseño.
const SKINS: Record<Skin, TetrisPalette> = {
  clasico: {
    boardBackground: "#000000",
    panelBackground: "#000000",
    gridLine: "rgba(255,255,255,0.08)",
    pieceColors: [
      null,
      "#4dd0e1", // I - cyan
      "#ffd54f", // O - yellow
      "#ba68c8", // T - purple
      "#81c784", // S - green
      "#e57373", // Z - red
      "#90caf9", // J - pale blue
      "#ffb74d", // L - orange
      "#9e9e9e", // N - tuerca (gris metálico)
    ],
    blockHighlight: "rgba(255,255,255,0.12)",
    glowBlur: 0,
    hudLabel: "rgba(255,255,255,0.5)",
    hudValue: "#ffffff",
    overlayBg: "rgba(0,0,0,0.6)",
    overlayTitle: "#ffffff",
    overlaySub: "rgba(255,255,255,0.65)",
  },
  // Consola de 4 bits: paleta reducida a tonos saturados planos (sin
  // pasteles) con glow de fósforo, en vez de fósforo mono-color — con
  // 8 piezas a distinguir, un solo tono ámbar/verde las volvería
  // indistinguibles entre sí.
  retro: {
    boardBackground: "#000000",
    panelBackground: "#000000",
    gridLine: "rgba(255,176,0,0.15)",
    pieceColors: [
      null,
      "#00e5e5", // I - cian fósforo
      "#e5e500", // O - amarillo fósforo
      "#b000e5", // T - magenta fósforo
      "#00e500", // S - verde fósforo
      "#e50000", // Z - rojo fósforo
      "#5566ff", // J - azul fósforo (aclarado para contraste sobre negro)
      "#e58500", // L - ámbar
      "#b5b5b5", // N - gris metálico claro
    ],
    blockHighlight: "rgba(255,255,255,0.18)",
    glowBlur: 6,
    hudLabel: "rgba(255,176,0,0.55)",
    hudValue: "#ffb000",
    overlayBg: "rgba(10,5,0,0.75)",
    overlayTitle: "#ffb000",
    overlaySub: "rgba(255,176,0,0.7)",
  },
  // Synthwave/arcade neón: reusa los hex de --cyan/--magenta/--yellow/--green
  // de app/globals.css para las piezas más importantes (I, T, S) y suma
  // tonos complementarios saturados para el resto.
  neon: {
    boardBackground: "#000000",
    panelBackground: "#000000",
    gridLine: "rgba(0,245,255,0.15)",
    pieceColors: [
      null,
      "#00f5ff", // I - cyan
      "#f5ff00", // O - yellow
      "#ff006e", // T - magenta
      "#00ff88", // S - green
      "#ff3860", // Z - rojo neón
      "#7c4dff", // J - violeta neón
      "#ff8c00", // L - naranja neón
      "#e0e0ff", // N - plata neón
    ],
    blockHighlight: "rgba(255,255,255,0.2)",
    glowBlur: 8,
    hudLabel: "rgba(0,245,255,0.55)",
    hudValue: "#00f5ff",
    overlayBg: "rgba(0,0,0,0.7)",
    overlayTitle: "#ff006e",
    overlaySub: "rgba(0,245,255,0.75)",
  },
};

const PIECES: (number[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

interface Piece {
  type: number;
  shape: number[][];
  x: number;
  y: number;
}

/**
 * Port de resources/03-tetris/game.js. Dos canvas en vez de uno: el
 * tablero (motor real: colisiones, rotación, líneas) y un panel con el
 * HUD interno (SCORE/LINES/LEVEL) y la vista previa de la siguiente
 * pieza — ver spec 07, decisión de arquitectura de dos canvas.
 */
const TetrisGame = forwardRef<GameHandle, GameComponentProps>(
  function TetrisGame({ onHudChange }, ref) {
    const boardCanvasRef = useRef<HTMLCanvasElement>(null);
    const panelCanvasRef = useRef<HTMLCanvasElement>(null);

    const onHudChangeRef = useRef(onHudChange);
    useEffect(() => {
      onHudChangeRef.current = onHudChange;
    }, [onHudChange]);

    const controlsRef = useRef<GameHandle>({
      togglePause: () => {},
      forceGameOver: () => {},
      restart: () => {},
    });
    useImperativeHandle(ref, () => ({
      togglePause: () => controlsRef.current.togglePause(),
      forceGameOver: () => controlsRef.current.forceGameOver(),
      restart: () => controlsRef.current.restart(),
      setSkin: handleSkinChange,
    }));

    // Skin activa: estado de React (para el <select>, y para persistirla)
    // más un ref (para que el loop del motor, que corre dentro de un
    // useEffect con deps vacías, siempre lea la paleta más reciente sin
    // que cambiar de skin reinicie la partida en curso).
    const [skin, setSkin] = useState<Skin>(() => loadSkin("tetris"));
    const paletteRef = useRef<TetrisPalette>(SKINS[skin]);
    const skinRef = useRef<Skin>(skin);
    useEffect(() => {
      paletteRef.current = SKINS[skin];
      skinRef.current = skin;
    }, [skin]);

    const handleSkinChange = (next: Skin) => {
      setSkin(next);
      saveSkin("tetris", next);
    };

    useEffect(() => {
      const boardCanvas = boardCanvasRef.current;
      const panelCanvas = panelCanvasRef.current;
      if (!boardCanvas || !panelCanvas) return;
      const ctx = boardCanvas.getContext("2d");
      const panelCtx = panelCanvas.getContext("2d");
      if (!ctx || !panelCtx) return;

      // ── Input ────────────────────────────────────────────────────────────
      // KeyP del original se elimina: la pausa la dispara GamePlayer vía
      // togglePause() del handle, no un atajo propio del motor.
      const GAME_KEYS = new Set([
        "ArrowLeft",
        "ArrowRight",
        "ArrowDown",
        "ArrowUp",
        "KeyX",
        "Space",
      ]);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!GAME_KEYS.has(e.code)) return;
        e.preventDefault();
        if (phase !== "playing") return;
        switch (e.code) {
          case "ArrowLeft":
            if (!collide(current.shape, current.x - 1, current.y)) current.x--;
            break;
          case "ArrowRight":
            if (!collide(current.shape, current.x + 1, current.y)) current.x++;
            break;
          case "ArrowDown":
            softDrop();
            break;
          case "ArrowUp":
          case "KeyX":
            tryRotate();
            break;
          case "Space":
            hardDrop();
            break;
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      // ── Estado del juego ─────────────────────────────────────────────────
      let board: number[][];
      let current: Piece;
      let next: Piece;
      let score = 0;
      let lines = 0;
      let level = 1;
      let phase: "playing" | "paused" | "gameover" = "playing";
      let dropInterval = 1000;
      let dropAccum = 0;

      function createBoard(): number[][] {
        return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
      }

      function randomPiece(): Piece {
        const type = Math.floor(Math.random() * 8) + 1;
        const shape = PIECES[type]!.map((row) => [...row]);
        return {
          type,
          shape,
          x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
          y: 0,
        };
      }

      function collide(shape: number[][], ox: number, oy: number): boolean {
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (!shape[r][c]) continue;
            const nx = ox + c;
            const ny = oy + r;
            if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
            if (ny >= 0 && board[ny][nx]) return true;
          }
        }
        return false;
      }

      function rotateCW(shape: number[][]): number[][] {
        const rows = shape.length;
        const cols = shape[0].length;
        const result: number[][] = Array.from({ length: cols }, () =>
          new Array(rows).fill(0),
        );
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
        return result;
      }

      function tryRotate() {
        const rotated = rotateCW(current.shape);
        const kicks = [0, -1, 1, -2, 2];
        for (const kick of kicks) {
          if (!collide(rotated, current.x + kick, current.y)) {
            current.shape = rotated;
            current.x += kick;
            return;
          }
        }
      }

      function merge() {
        for (let r = 0; r < current.shape.length; r++)
          for (let c = 0; c < current.shape[r].length; c++)
            if (current.shape[r][c])
              board[current.y + r][current.x + c] = current.shape[r][c];
      }

      function clearLines() {
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (board[r].every((v) => v !== 0)) {
            board.splice(r, 1);
            board.unshift(new Array(COLS).fill(0));
            cleared++;
            r++;
          }
        }
        if (cleared) {
          lines += cleared;
          score += (LINE_SCORES[cleared] || 0) * level;
          level = Math.floor(lines / 10) + 1;
          dropInterval = Math.max(100, 1000 - (level - 1) * 90);
        }
      }

      function ghostY(): number {
        let gy = current.y;
        while (!collide(current.shape, current.x, gy + 1)) gy++;
        return gy;
      }

      function hardDrop() {
        const gy = ghostY();
        score += (gy - current.y) * 2;
        current.y = gy;
        lockPiece();
      }

      function softDrop() {
        if (!collide(current.shape, current.x, current.y + 1)) {
          current.y++;
          score += 1;
        } else {
          lockPiece();
        }
      }

      function lockPiece() {
        merge();
        clearLines();
        spawn();
      }

      function spawn() {
        current = next;
        next = randomPiece();
        if (collide(current.shape, current.x, current.y)) {
          phase = "gameover";
        }
      }

      function initGame() {
        board = createBoard();
        score = 0;
        lines = 0;
        level = 1;
        phase = "playing";
        dropInterval = 1000;
        dropAccum = 0;
        next = randomPiece();
        spawn();
      }

      // ── Draw: tablero ────────────────────────────────────────────────────
      function drawBlock(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        colorIndex: number,
        size: number,
        alpha?: number,
        baseX = 0,
        baseY = 0,
      ) {
        if (!colorIndex) return;
        const palette = paletteRef.current;
        context.globalAlpha = alpha ?? 1;
        context.shadowBlur = palette.glowBlur;
        context.shadowColor = palette.pieceColors[colorIndex] as string;
        context.fillStyle = palette.pieceColors[colorIndex] as string;
        context.fillRect(
          baseX + x * size + 1,
          baseY + y * size + 1,
          size - 2,
          size - 2,
        );
        context.shadowBlur = 0;
        context.fillStyle = palette.blockHighlight;
        context.fillRect(
          baseX + x * size + 1,
          baseY + y * size + 1,
          size - 2,
          4,
        );
        context.globalAlpha = 1;
      }

      function drawGrid() {
        ctx!.strokeStyle = paletteRef.current.gridLine;
        ctx!.lineWidth = 0.5;
        for (let c = 1; c < COLS; c++) {
          ctx!.beginPath();
          ctx!.moveTo(c * BLOCK, 0);
          ctx!.lineTo(c * BLOCK, ROWS * BLOCK);
          ctx!.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
          ctx!.beginPath();
          ctx!.moveTo(0, r * BLOCK);
          ctx!.lineTo(COLS * BLOCK, r * BLOCK);
          ctx!.stroke();
        }
      }

      function drawOverlay(title: string, sub: string) {
        const palette = paletteRef.current;
        ctx!.fillStyle = palette.overlayBg;
        ctx!.fillRect(0, 0, COLS * BLOCK, ROWS * BLOCK);
        ctx!.textAlign = "center";
        ctx!.fillStyle = palette.overlayTitle;
        ctx!.font = "bold 22px monospace";
        ctx!.fillText(title, (COLS * BLOCK) / 2, (ROWS * BLOCK) / 2 - 12);
        ctx!.font = "13px monospace";
        ctx!.fillStyle = palette.overlaySub;
        ctx!.fillText(sub, (COLS * BLOCK) / 2, (ROWS * BLOCK) / 2 + 14);
      }

      function drawBoard() {
        ctx!.fillStyle = paletteRef.current.boardBackground;
        ctx!.fillRect(0, 0, COLS * BLOCK, ROWS * BLOCK);
        drawGrid();

        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            drawBlock(ctx!, c, r, board[r][c], BLOCK);

        const gy = ghostY();
        for (let r = 0; r < current.shape.length; r++)
          for (let c = 0; c < current.shape[r].length; c++)
            if (current.shape[r][c])
              drawBlock(
                ctx!,
                current.x + c,
                gy + r,
                current.shape[r][c],
                BLOCK,
                0.2,
              );

        for (let r = 0; r < current.shape.length; r++)
          for (let c = 0; c < current.shape[r].length; c++)
            drawBlock(
              ctx!,
              current.x + c,
              current.y + r,
              current.shape[r][c],
              BLOCK,
            );

        if (phase === "gameover") drawOverlay("GAME OVER", `PUNTAJE: ${score}`);
        if (phase === "paused")
          drawOverlay("PAUSADO", "PRESIONÁ PAUSA PARA REANUDAR");
      }

      // ── Draw: panel (HUD interno + siguiente pieza) ────────────────────────
      function drawPanel() {
        const palette = paletteRef.current;
        panelCtx!.fillStyle = palette.panelBackground;
        panelCtx!.fillRect(0, 0, PANEL_W, PANEL_H);
        panelCtx!.textAlign = "left";

        const stat = (label: string, value: string, y: number) => {
          panelCtx!.fillStyle = palette.hudLabel;
          panelCtx!.font = "12px monospace";
          panelCtx!.fillText(label, 16, y);
          panelCtx!.fillStyle = palette.hudValue;
          panelCtx!.font = "bold 22px monospace";
          panelCtx!.fillText(value, 16, y + 26);
        };

        stat("SCORE", score.toLocaleString(), 30);
        stat("LINES", String(lines), 96);
        stat("LEVEL", String(level), 162);

        panelCtx!.fillStyle = palette.hudLabel;
        panelCtx!.font = "12px monospace";
        panelCtx!.fillText("NEXT", 16, 228);

        const NEXT_BOX_X = 16;
        const NEXT_BOX_Y = 244;
        const shape = next.shape;
        const offX = Math.floor((4 - shape[0].length) / 2);
        const offY = Math.floor((4 - shape.length) / 2);
        for (let r = 0; r < shape.length; r++)
          for (let c = 0; c < shape[r].length; c++)
            drawBlock(
              panelCtx!,
              offX + c,
              offY + r,
              shape[r][c],
              NEXT_BLOCK,
              1,
              NEXT_BOX_X,
              NEXT_BOX_Y,
            );
      }

      // ── HUD externo ──────────────────────────────────────────────────────
      // Se reporta hacia afuera solo cuando algún valor relevante cambia, no
      // en cada frame, para no forzar renders de React a 60fps. Tetris no
      // tiene vidas: lives siempre 0, el registro oculta ese stat
      // (showLives: false) del panel externo de GamePlayer.
      let lastHud: GameHudState | null = null;
      function reportHud() {
        const next: GameHudState = {
          score,
          lives: 0,
          level,
          phase,
          extra: { lines },
          skin: skinRef.current,
        };
        if (
          !lastHud ||
          lastHud.score !== next.score ||
          lastHud.level !== next.level ||
          lastHud.phase !== next.phase ||
          lastHud.skin !== next.skin ||
          lastHud.extra?.lines !== next.extra?.lines
        ) {
          lastHud = next;
          onHudChangeRef.current?.(next);
        }
      }

      // ── Controles externos (PAUSA / FIN) ────────────────────────────────
      controlsRef.current.togglePause = () => {
        if (phase === "playing") phase = "paused";
        else if (phase === "paused") phase = "playing";
        // Pausar/reanudar durante "gameover" no tiene efecto.
        reportHud();
      };

      controlsRef.current.forceGameOver = () => {
        if (phase === "gameover") return;
        phase = "gameover";
        reportHud();
      };

      controlsRef.current.restart = () => {
        initGame();
        reportHud();
      };

      // ── Loop principal ───────────────────────────────────────────────────
      let rafId = 0;
      let lastTime: number | null = null;

      function loop(ts: number) {
        const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 250);
        lastTime = ts;

        if (phase === "playing") {
          dropAccum += dt;
          if (dropAccum >= dropInterval) {
            dropAccum = 0;
            if (!collide(current.shape, current.x, current.y + 1)) {
              current.y++;
            } else {
              lockPiece();
            }
          }
        }

        drawBoard();
        drawPanel();
        reportHud();
        rafId = requestAnimationFrame(loop);
      }

      initGame();
      reportHud();
      rafId = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    return (
      <div className="game-arena game-arena-canvas tetris-arena">
        <canvas
          ref={boardCanvasRef}
          width={COLS * BLOCK}
          height={ROWS * BLOCK}
          className="game-canvas"
        />
        <canvas
          ref={panelCanvasRef}
          width={PANEL_W}
          height={PANEL_H}
          className="tetris-panel-canvas"
        />
        <div className="game-skin-panel">
          <SkinSelector value={skin} onChange={handleSkinChange} />
        </div>
      </div>
    );
  },
);

export default TetrisGame;
