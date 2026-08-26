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

// Resolución lógica fija del tablero: grilla 16×14 de celdas de 40px
// (spec 01-ranaria-jugable). No es 4:3 como los demás juegos — .game-canvas
// se estira al 100%/100% de .crt-screen (aspect-ratio 4/3), así que el
// dibujo queda levemente estirado; aceptable porque todo son primitivas
// canvas (sin sprites) y la mecánica de grilla no depende del aspect ratio.
const COLS = 16;
const ROWS = 14;
const CELL = 40;
const W = COLS * CELL; // 640
const H = ROWS * CELL; // 560

// Zonas (fila 0 = arriba), tal como las define el Paso 2 del spec.
const ROW_GOALS = 0;
const ROW_RIVER_TOP = 1;
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7;
const ROW_ROAD_TOP = 8;
const ROW_ROAD_BOT = 12;
const ROW_START = 13;

// 5 bocas destino de 2 columnas cada una, con huecos de 1 columna entre
// ellas (y en los bordes) — 5×2 + 6 huecos = 16 columnas.
const GOALS = [
  { start: 1, width: 2 },
  { start: 4, width: 2 },
  { start: 7, width: 2 },
  { start: 10, width: 2 },
  { start: 13, width: 2 },
];
const FROG_START_COL = 8;

const JUMP_MS = 120;
const ROUND_TIME_BASE = 15; // segundos
const ROUND_TIME_MIN = 6;
const LEVEL_SPEED_GROWTH = 1.15; // +15% por nivel, compuesto
const TURTLE_CYCLE_MS = 4500; // 3s visible + 1.5s sumergida
const HUD_BAND = 16; // franja superior de la fila 0 reservada al HUD interno

type Direction = "up" | "down" | "left" | "right";

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

interface Entity {
  col: number;
  width: number;
  type: "car" | "truck" | "log" | "turtle";
  submerged?: boolean;
}

interface Lane {
  row: number;
  speed: number;
  dir: 1 | -1;
  kind: "road" | "river";
  entities: Entity[];
  submergeT: number;
}

interface Frog {
  col: number;
  row: number;
  animating: boolean;
  animT: number;
  animFromCol: number;
  animFromRow: number;
  targetCol: number;
  targetRow: number;
}

/**
 * Roles de color que necesita el motor de Frogger: fondos de las 4 zonas
 * (carretera, río, seguras, fila de metas), bocas destino, vehículos
 * (autos/camiones), obstáculos del río (troncos/tortugas), la rana, el HUD
 * interno (score/nivel/vidas/barra de tiempo) y el overlay de
 * pausa/game-over. `HUD_BAND` (franja superior de 16px) se mantiene igual
 * en los tres skins — solo cambian los colores que se dibujan ahí.
 */
interface FroggerPalette {
  zoneSafe: string; // fila 7 (media) y fila 13 (start)
  zoneRiver: string; // filas 1–6
  zoneRoad: string; // filas 8–12
  zoneGoalsRow: string; // fondo de la fila 0 (detrás de las bocas)
  goalBoxFill: string; // interior de cada boca destino
  goalBoxBorder: string; // borde dorado de cada boca
  goalOccupied: string; // marca de rana ya llegada a una boca
  carColorA: string; // autos, columna par
  carColorB: string; // autos, columna impar
  vehicleWheel: string; // ruedas de autos/camiones
  truckBody: string; // caja del camión
  truckCab: string; // cabina del camión
  logFill: string; // tronco
  logLine: string; // vetas del tronco
  turtleFill: string; // tortuga (usa globalAlpha al sumergirse)
  frogBody: string; // cuerpo/patas de la rana
  frogGlow: string; // shadowColor detrás de la rana
  frogGlowBlur: number; // shadowBlur (px)
  frogEyeWhite: string; // esclerótica del ojo
  frogEyePupil: string; // pupila
  hudText: string; // "Score"/"Nivel" del HUD interno
  hudLives: string; // iconos de vidas
  hudTimeGood: string; // barra de tiempo, >50%
  hudTimeWarn: string; // barra de tiempo, 20–50%
  hudTimeBad: string; // barra de tiempo, <20%
  overlayBg: string; // rgba() de fondo de "PAUSADO"/"GAME OVER"
  overlayText: string; // texto del overlay
}

// `clasico` es el look original del juego (spec 01-ranaria-jugable): los
// mismos literales que ya estaban hardcodeados en ctx.fillStyle/strokeStyle
// antes de este cambio, solo movidos a esta estructura — no es un rediseño.
const SKINS: Record<Skin, FroggerPalette> = {
  clasico: {
    zoneSafe: "#123420",
    zoneRiver: "#0a2a4d",
    zoneRoad: "#111111",
    zoneGoalsRow: "#0b3d24",
    goalBoxFill: "#0f5a34",
    goalBoxBorder: "#ffd700",
    goalOccupied: "#39ff6a",
    carColorA: "#ff3b3b",
    carColorB: "#3b7bff",
    vehicleWheel: "#111111",
    truckBody: "#8a8a8a",
    truckCab: "#4a4a4a",
    logFill: "#7a4a20",
    logLine: "#5a3512",
    turtleFill: "#2fae4e",
    frogBody: "#39ff6a",
    frogGlow: "#39ff6a",
    frogGlowBlur: 0,
    frogEyeWhite: "#ffffff",
    frogEyePupil: "#04140b",
    hudText: "#ffffff",
    hudLives: "#39ff6a",
    hudTimeGood: "#39ff6a",
    hudTimeWarn: "#ffd700",
    hudTimeBad: "#ff3b3b",
    overlayBg: "rgba(0, 0, 0, 0.6)",
    overlayText: "#ffffff",
  },
  // Fósforo CRT de 8-bit: verde para lo "seguro" (rana, río, pasto, metas) y
  // ámbar para el peligro (carretera, vehículos), con glow en la rana para
  // que no quede plana contra el negro — paleta reducida a esas dos familias
  // de tono en vez de los rojos/azules/marrones de `clasico`.
  retro: {
    zoneSafe: "#062b0f",
    zoneRiver: "#04241f",
    zoneRoad: "#1a0f00",
    zoneGoalsRow: "#062b0f",
    goalBoxFill: "#0a4d1a",
    goalBoxBorder: "#ffb000",
    goalOccupied: "#33ff33",
    carColorA: "#ffb000",
    carColorB: "#cc7700",
    vehicleWheel: "#050505",
    truckBody: "#ffcf66",
    truckCab: "#cc7700",
    logFill: "#1f8f1f",
    logLine: "#0a4d0a",
    turtleFill: "#66ff66",
    frogBody: "#33ff33",
    frogGlow: "#33ff33",
    frogGlowBlur: 12,
    frogEyeWhite: "#e0ffe0",
    frogEyePupil: "#031f03",
    hudText: "#33ff33",
    hudLives: "#ffb000",
    hudTimeGood: "#33ff33",
    hudTimeWarn: "#ffb000",
    hudTimeBad: "#ff3333",
    overlayBg: "rgba(0, 0, 0, 0.75)",
    overlayText: "#33ff33",
  },
  // Synthwave/arcade neón: reusa los hex que app/globals.css define para
  // --cyan/--magenta/--yellow/--green en vez de inventar tonos nuevos.
  neon: {
    zoneSafe: "#0a0a1f",
    zoneRiver: "#0f0030",
    zoneRoad: "#05050a",
    zoneGoalsRow: "#0a0a1f",
    goalBoxFill: "#1a0a35",
    goalBoxBorder: "#f5ff00",
    goalOccupied: "#00f5ff",
    carColorA: "#ff006e",
    carColorB: "#00f5ff",
    vehicleWheel: "#0a0a0f",
    truckBody: "#f5ff00",
    truckCab: "#ff006e",
    logFill: "#00ff88",
    logLine: "#00b35f",
    turtleFill: "#00ff88",
    frogBody: "#00f5ff",
    frogGlow: "#00f5ff",
    frogGlowBlur: 12,
    frogEyeWhite: "#ffffff",
    frogEyePupil: "#0a0a0f",
    hudText: "#00f5ff",
    hudLives: "#f5ff00",
    hudTimeGood: "#00ff88",
    hudTimeWarn: "#f5ff00",
    hudTimeBad: "#ff006e",
    overlayBg: "rgba(10, 0, 20, 0.7)",
    overlayText: "#00f5ff",
  },
};

function roundTimeForLevel(level: number): number {
  return Math.max(ROUND_TIME_MIN, ROUND_TIME_BASE - (level - 1));
}

function overlaps(col: number, entity: Entity): boolean {
  return entity.col < col + 1 && entity.col + entity.width > col;
}

function makeRoadEntities(): Entity[] {
  const entities: Entity[] = [];
  let col = -4 + Math.floor(Math.random() * 4);
  while (col < COLS + 4) {
    const isTruck = Math.random() < 0.35;
    const width = isTruck ? (Math.random() < 0.5 ? 2 : 3) : 1;
    entities.push({ col, width, type: isTruck ? "truck" : "car" });
    col += width + 3 + Math.floor(Math.random() * 3); // hueco 3–5 columnas
  }
  return entities;
}

function makeRiverEntities(): Entity[] {
  const entities: Entity[] = [];
  let col = -4 + Math.floor(Math.random() * 4);
  while (col < COLS + 4) {
    const isTurtle = Math.random() < 0.4;
    const width = isTurtle
      ? Math.random() < 0.5
        ? 2
        : 3
      : 2 + Math.floor(Math.random() * 3);
    entities.push({
      col,
      width,
      type: isTurtle ? "turtle" : "log",
      submerged: false,
    });
    col += width + 2 + Math.floor(Math.random() * 3);
  }
  return entities;
}

function buildLanes(level: number): Lane[] {
  const mult = Math.pow(LEVEL_SPEED_GROWTH, level - 1);
  const lanes: Lane[] = [];
  for (let i = 0; i < ROW_ROAD_BOT - ROW_ROAD_TOP + 1; i++) {
    const row = ROW_ROAD_TOP + i;
    lanes.push({
      row,
      speed: (1 + Math.random() * 1.6) * mult, // columnas/segundo
      dir: i % 2 === 0 ? 1 : -1,
      kind: "road",
      entities: makeRoadEntities(),
      submergeT: 0,
    });
  }
  for (let i = 0; i < ROW_RIVER_BOT - ROW_RIVER_TOP + 1; i++) {
    const row = ROW_RIVER_TOP + i;
    lanes.push({
      row,
      speed: (0.7 + Math.random() * 1.3) * mult, // columnas/segundo
      dir: i % 2 === 0 ? -1 : 1,
      kind: "river",
      entities: makeRiverEntities(),
      submergeT: Math.floor(Math.random() * TURTLE_CYCLE_MS),
    });
  }
  return lanes;
}

/**
 * Frogger escrito desde cero (canvas puro, sin sprites — spec
 * 01-ranaria-jugable). Sigue el mismo boilerplate que
 * AsteroidsGame/SerpentinaGame: forwardRef<GameHandle, GameComponentProps>,
 * estado del motor aislado dentro del useEffect, listeners en window.
 *
 * Nota de implementación: el spec original describía props individuales
 * (paused, onScoreChange, onLivesChange, onLevelChange, onGameOver) y una
 * play-page dedicada en app/games/frogger/play/. Se adaptó al contrato real
 * del proyecto (GameComponentProps.onHudChange + GameHandle vía ref,
 * montado por la ruta genérica app/jugar/[id]/ a través de GAME_REGISTRY)
 * por decisión explícita al detectar la discrepancia — ver historial de la
 * sesión de implementación.
 */
const FroggerGame = forwardRef<GameHandle, GameComponentProps>(
  function FroggerGame({ onHudChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
    // más un ref (para que el loop, que corre dentro de un useEffect con
    // deps vacías, siempre lea la paleta más reciente sin que cambiar de
    // skin reinicie la partida en curso).
    const [skin, setSkin] = useState<Skin>(() => loadSkin("frogger"));
    const paletteRef = useRef<FroggerPalette>(SKINS[skin]);
    const skinRef = useRef<Skin>(skin);
    useEffect(() => {
      paletteRef.current = SKINS[skin];
      skinRef.current = skin;
    }, [skin]);

    const handleSkinChange = (next: Skin) => {
      setSkin(next);
      saveSkin("frogger", next);
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ── Estado mutable del motor ─────────────────────────────────────────
      let score = 0;
      let lives = 3;
      let level = 1;
      let lanes: Lane[] = [];
      let goalsOccupied: boolean[] = [];
      let roundTimer = ROUND_TIME_BASE;
      let minRowReached = ROW_START;
      let gameState: "playing" | "paused" | "gameover" = "playing";
      let pendingDir: Direction | null = null;
      const frog: Frog = {
        col: FROG_START_COL,
        row: ROW_START,
        animating: false,
        animT: 0,
        animFromCol: FROG_START_COL,
        animFromRow: ROW_START,
        targetCol: FROG_START_COL,
        targetRow: ROW_START,
      };

      function resetFrogToStart() {
        frog.col = FROG_START_COL;
        frog.row = ROW_START;
        frog.animating = false;
        frog.animT = 0;
      }

      function initGame() {
        score = 0;
        lives = 3;
        level = 1;
        goalsOccupied = GOALS.map(() => false);
        lanes = buildLanes(level);
        roundTimer = roundTimeForLevel(level);
        minRowReached = ROW_START;
        gameState = "playing";
        pendingDir = null;
        resetFrogToStart();
      }

      // ── Input ─────────────────────────────────────────────────────────────
      const handleKeyDown = (e: KeyboardEvent) => {
        const dir = KEY_TO_DIR[e.code];
        if (!dir) return;
        e.preventDefault();
        pendingDir = dir;
      };
      window.addEventListener("keydown", handleKeyDown);

      // ── Movimiento de la rana ─────────────────────────────────────────────
      function startJump(dir: Direction) {
        const baseCol = Math.round(frog.col);
        let targetCol = baseCol;
        let targetRow = frog.row;
        if (dir === "up") targetRow -= 1;
        else if (dir === "down") targetRow += 1;
        else if (dir === "left") targetCol -= 1;
        else targetCol += 1;
        targetCol = Math.max(0, Math.min(COLS - 1, targetCol));
        targetRow = Math.max(0, Math.min(ROWS - 1, targetRow));
        if (targetCol === baseCol && targetRow === frog.row) return; // borde
        frog.animating = true;
        frog.animT = 0;
        frog.animFromCol = frog.col;
        frog.animFromRow = frog.row;
        frog.targetCol = targetCol;
        frog.targetRow = targetRow;
      }

      function checkRoadCollision(): boolean {
        return lanes.some(
          (lane) =>
            lane.kind === "road" &&
            lane.row === frog.row &&
            lane.entities.some((e) => overlaps(frog.col, e)),
        );
      }

      function getSupport(): { lane: Lane; entity: Entity } | null {
        for (const lane of lanes) {
          if (lane.kind !== "river" || lane.row !== frog.row) continue;
          for (const entity of lane.entities) {
            if (entity.type === "turtle" && entity.submerged) continue;
            if (overlaps(frog.col, entity)) return { lane, entity };
          }
        }
        return null;
      }

      function findGoalIndex(col: number): number {
        return GOALS.findIndex(
          (g) =>
            Math.round(col) >= g.start && Math.round(col) < g.start + g.width,
        );
      }

      function killFrog() {
        lives--;
        if (lives <= 0) {
          lives = 0;
          gameState = "gameover";
          return;
        }
        resetFrogToStart();
        roundTimer = roundTimeForLevel(level);
      }

      function completeRound() {
        score += 200;
        level++;
        goalsOccupied = GOALS.map(() => false);
        lanes = buildLanes(level);
        roundTimer = roundTimeForLevel(level);
        minRowReached = ROW_START;
        resetFrogToStart();
      }

      function resolveGoal() {
        const idx = findGoalIndex(frog.col);
        if (idx === -1 || goalsOccupied[idx]) {
          killFrog();
          return;
        }
        goalsOccupied[idx] = true;
        score += 50 + Math.round(roundTimer) * 10;
        if (goalsOccupied.every(Boolean)) {
          completeRound();
        } else {
          resetFrogToStart();
          roundTimer = roundTimeForLevel(level);
        }
      }

      function completeJump() {
        frog.col = frog.targetCol;
        frog.row = frog.targetRow;
        frog.animating = false;

        if (frog.row < minRowReached) {
          score += (minRowReached - frog.row) * 10;
          minRowReached = frog.row;
        }

        if (frog.row >= ROW_ROAD_TOP && frog.row <= ROW_ROAD_BOT) {
          if (checkRoadCollision()) killFrog();
        } else if (frog.row >= ROW_RIVER_TOP && frog.row <= ROW_RIVER_BOT) {
          if (!getSupport()) killFrog();
        } else if (frog.row === ROW_GOALS) {
          resolveGoal();
        }
        // ROW_SAFE_MID y ROW_START: siempre seguras, sin acción.
      }

      function moveLanes(dtMs: number) {
        for (const lane of lanes) {
          for (const entity of lane.entities) {
            // lane.speed está en columnas/segundo (no columnas/frame): a
            // 60fps (dtMs≈16) esto mueve ~lane.speed/60 columnas por frame.
            // Una división por 16 (como sugería el pseudocódigo del spec,
            // pensado en px/frame) hacía que el tráfico cruzara el tablero
            // en una fracción de segundo — imjugable. Ver nota de sesión.
            entity.col += (lane.speed * lane.dir * dtMs) / 1000;
            if (lane.dir === 1 && entity.col > COLS) {
              entity.col = -entity.width;
            } else if (lane.dir === -1 && entity.col + entity.width < 0) {
              entity.col = COLS;
            }
          }
          if (lane.kind === "river") {
            lane.submergeT += dtMs;
            const phase = lane.submergeT % TURTLE_CYCLE_MS;
            const submerged = phase >= 3000;
            for (const entity of lane.entities) {
              if (entity.type === "turtle") entity.submerged = submerged;
            }
          }
        }
      }

      function updateFrog(dtMs: number) {
        if (frog.animating) {
          frog.animT += dtMs;
          if (frog.animT >= JUMP_MS) completeJump();
          return;
        }

        if (pendingDir) {
          const dir = pendingDir;
          pendingDir = null;
          startJump(dir);
          if (frog.animating) return;
        }

        if (frog.row >= ROW_ROAD_TOP && frog.row <= ROW_ROAD_BOT) {
          if (checkRoadCollision()) killFrog();
        } else if (frog.row >= ROW_RIVER_TOP && frog.row <= ROW_RIVER_BOT) {
          const support = getSupport();
          if (!support) {
            killFrog();
          } else {
            frog.col += (support.lane.dir * support.lane.speed * dtMs) / 1000;
            if (frog.col < 0 || frog.col > COLS - 1) killFrog();
          }
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      function drawZones() {
        const palette = paletteRef.current;
        ctx!.fillStyle = palette.zoneSafe; // zonas seguras (base + fila media)
        ctx!.fillRect(0, 0, W, H);
        ctx!.fillStyle = palette.zoneRiver; // río
        ctx!.fillRect(
          0,
          ROW_RIVER_TOP * CELL,
          W,
          (ROW_RIVER_BOT - ROW_RIVER_TOP + 1) * CELL,
        );
        ctx!.fillStyle = palette.zoneRoad; // carretera
        ctx!.fillRect(
          0,
          ROW_ROAD_TOP * CELL,
          W,
          (ROW_ROAD_BOT - ROW_ROAD_TOP + 1) * CELL,
        );
        ctx!.fillStyle = palette.zoneGoalsRow; // fila de metas
        ctx!.fillRect(0, ROW_GOALS * CELL, W, CELL);

        // Las bocas dejan libre una franja superior (0–16px) para el HUD
        // interno (drawHud dibuja ahí score/nivel/vidas/barra de tiempo) —
        // sin esto, el texto y las bocas se superponen en la fila 0.
        GOALS.forEach((g, i) => {
          const x = g.start * CELL;
          const y = ROW_GOALS * CELL + HUD_BAND;
          const w = g.width * CELL;
          const h = CELL - HUD_BAND - 3;
          ctx!.fillStyle = palette.goalBoxFill;
          ctx!.fillRect(x + 3, y, w - 6, h);
          ctx!.strokeStyle = palette.goalBoxBorder;
          ctx!.lineWidth = 2;
          ctx!.strokeRect(x + 3, y, w - 6, h);
          if (goalsOccupied[i]) {
            ctx!.fillStyle = palette.goalOccupied;
            ctx!.beginPath();
            ctx!.ellipse(x + w / 2, y + h / 2, 10, 8, 0, 0, Math.PI * 2);
            ctx!.fill();
          }
        });
      }

      function drawEntities() {
        const palette = paletteRef.current;
        for (const lane of lanes) {
          const y = lane.row * CELL;
          for (const entity of lane.entities) {
            const x = entity.col * CELL;
            const w = entity.width * CELL;
            if (entity.type === "car") {
              ctx!.fillStyle =
                entity.col % 2 === 0 ? palette.carColorA : palette.carColorB;
              ctx!.fillRect(x + 2, y + 8, w - 4, CELL - 16);
              ctx!.fillStyle = palette.vehicleWheel;
              ctx!.beginPath();
              ctx!.arc(x + 8, y + CELL - 6, 5, 0, Math.PI * 2);
              ctx!.arc(x + w - 8, y + CELL - 6, 5, 0, Math.PI * 2);
              ctx!.fill();
            } else if (entity.type === "truck") {
              ctx!.fillStyle = palette.truckBody;
              ctx!.fillRect(x + 2, y + 6, w - 4, CELL - 12);
              ctx!.fillStyle = palette.truckCab;
              const cabW = CELL - 8;
              const cabX = lane.dir === 1 ? x + w - cabW - 2 : x + 2;
              ctx!.fillRect(cabX, y + 6, cabW, CELL - 12);
              ctx!.fillStyle = palette.vehicleWheel;
              ctx!.beginPath();
              ctx!.arc(x + 8, y + CELL - 6, 5, 0, Math.PI * 2);
              ctx!.arc(x + w - 8, y + CELL - 6, 5, 0, Math.PI * 2);
              ctx!.fill();
            } else if (entity.type === "log") {
              ctx!.fillStyle = palette.logFill;
              ctx!.fillRect(x + 1, y + 10, w - 2, CELL - 20);
              ctx!.strokeStyle = palette.logLine;
              ctx!.lineWidth = 1;
              for (let lx = x + 6; lx < x + w - 4; lx += 8) {
                ctx!.beginPath();
                ctx!.moveTo(lx, y + 10);
                ctx!.lineTo(lx, y + CELL - 10);
                ctx!.stroke();
              }
            } else {
              // turtle
              ctx!.globalAlpha = entity.submerged ? 0.25 : 1;
              ctx!.fillStyle = palette.turtleFill;
              const count = Math.round(entity.width);
              for (let i = 0; i < count; i++) {
                const cx = x + i * CELL + CELL / 2;
                const cy = y + CELL / 2;
                ctx!.beginPath();
                ctx!.arc(cx, cy, CELL / 2 - 6, 0, Math.PI * 2);
                ctx!.fill();
              }
              ctx!.globalAlpha = 1;
            }
          }
        }
      }

      function drawFrog() {
        const palette = paletteRef.current;
        let drawCol = frog.col;
        let drawRow = frog.row;
        let lift = 0;
        if (frog.animating) {
          const t = Math.min(1, frog.animT / JUMP_MS);
          drawCol = frog.animFromCol + (frog.targetCol - frog.animFromCol) * t;
          drawRow = frog.animFromRow + (frog.targetRow - frog.animFromRow) * t;
          lift = Math.sin(t * Math.PI) * 8;
        }
        const px = drawCol * CELL + CELL / 2;
        const py = drawRow * CELL + CELL / 2 - lift;

        ctx!.shadowBlur = palette.frogGlowBlur;
        ctx!.shadowColor = palette.frogGlow;
        ctx!.fillStyle = palette.frogBody;
        ctx!.beginPath();
        ctx!.ellipse(px, py, 14, 12, 0, 0, Math.PI * 2);
        ctx!.fill();

        if (frog.animating) {
          ctx!.strokeStyle = palette.frogBody;
          ctx!.lineWidth = 3;
          ctx!.beginPath();
          ctx!.moveTo(px - 14, py);
          ctx!.lineTo(px - 20, py + 8);
          ctx!.moveTo(px + 14, py);
          ctx!.lineTo(px + 20, py + 8);
          ctx!.stroke();
        }
        ctx!.shadowBlur = 0;

        ctx!.fillStyle = palette.frogEyeWhite;
        ctx!.beginPath();
        ctx!.arc(px - 5, py - 6, 3.5, 0, Math.PI * 2);
        ctx!.arc(px + 5, py - 6, 3.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = palette.frogEyePupil;
        ctx!.beginPath();
        ctx!.arc(px - 5, py - 6, 1.6, 0, Math.PI * 2);
        ctx!.arc(px + 5, py - 6, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      function drawHud() {
        // Todo el HUD interno vive en la franja HUD_BAND (0–16px) de la
        // fila 0, arriba de las bocas destino (ver drawZones) para no
        // superponerse con ellas.
        const palette = paletteRef.current;
        ctx!.fillStyle = palette.hudText;
        ctx!.font = "bold 11px monospace";
        ctx!.textAlign = "left";
        ctx!.textBaseline = "top";
        ctx!.fillText("Score: " + score, 4, 2);
        ctx!.textAlign = "center";
        ctx!.fillText("Nivel: " + level, W / 2, 2);

        const iconSize = 9;
        const spacing = 3;
        ctx!.fillStyle = palette.hudLives;
        for (let i = 0; i < lives; i++) {
          const cx =
            W - 6 - (lives - i - 1) * (iconSize + spacing) - iconSize / 2;
          ctx!.beginPath();
          ctx!.ellipse(
            cx,
            2 + iconSize / 2,
            iconSize / 2,
            iconSize / 2 - 1,
            0,
            0,
            Math.PI * 2,
          );
          ctx!.fill();
        }

        const maxTime = roundTimeForLevel(level);
        const frac = Math.max(0, Math.min(1, roundTimer / maxTime));
        ctx!.fillStyle =
          frac > 0.5
            ? palette.hudTimeGood
            : frac > 0.2
              ? palette.hudTimeWarn
              : palette.hudTimeBad;
        ctx!.fillRect(0, HUD_BAND - 3, W * frac, 3);
      }

      function drawOverlay(message: string) {
        const palette = paletteRef.current;
        ctx!.fillStyle = palette.overlayBg;
        ctx!.fillRect(0, 0, W, H);
        ctx!.fillStyle = palette.overlayText;
        ctx!.font = "bold 40px monospace";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(message, W / 2, H / 2);
      }

      function draw() {
        drawZones();
        drawEntities();
        drawFrog();
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
        const next: GameHudState = {
          score,
          lives,
          level,
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

      controlsRef.current.restart = () => {
        initGame();
        reportHud();
      };

      // ── Loop principal ───────────────────────────────────────────────────
      let rafId = 0;
      let lastTime: number | null = null;

      function loop(ts: number) {
        const dtMs = lastTime === null ? 0 : Math.min(ts - lastTime, 250);
        lastTime = ts;

        if (gameState === "playing") {
          moveLanes(dtMs);
          updateFrog(dtMs);
          if (gameState === "playing") {
            roundTimer -= dtMs / 1000;
            if (roundTimer <= 0) {
              roundTimer = 0;
              killFrog();
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
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
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

export default FroggerGame;
