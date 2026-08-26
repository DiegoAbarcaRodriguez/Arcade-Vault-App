import type {
  ComponentType,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import AsteroidsGame from "@/components/AsteroidsGame";
import TouchControls from "@/components/TouchControls";
import TetrisGame from "@/components/TetrisGame";
import TetrisTouchControls from "@/components/TetrisTouchControls";
import BloqueBusterGame from "@/components/BloqueBusterGame";
import SerpentinaGame from "@/components/SerpentinaGame";
import SerpentinaTouchControls from "@/components/SerpentinaTouchControls";
import FroggerGame from "@/components/FroggerGame";
import FroggerTouchControls from "@/components/FroggerTouchControls";
import type { Skin } from "@/lib/games/skins";

/**
 * Contrato compartido que todo juego jugable debe cumplir para que
 * GamePlayer.tsx pueda montarlo sin conocer sus particularidades. Ver
 * components/AsteroidsGame.tsx para la implementación de referencia.
 */
export interface GameHudState {
  score: number;
  lives: number;
  level: number;
  phase: "playing" | "paused" | "dead" | "gameover";
  // Métricas propias del juego (ej. tripleShotSeconds, lines) que el
  // canvas dibuja en su propio HUD interno; el panel externo de
  // GamePlayer no las muestra.
  extra?: Record<string, string | number>;
  // Skin visual activa (clásico/retro/neón), solo en juegos que la
  // soportan. GamePlayer usa su presencia para decidir si renderiza el
  // <SkinSelector> en el HUD de escritorio (ver GameHandle.setSkin).
  skin?: Skin;
}

export interface GameHandle {
  togglePause: () => void;
  forceGameOver: () => void; // usado por el botón FIN tras confirmar
  restart: () => void; // usado por "JUGAR DE NUEVO" en la pantalla de GAME OVER
  // Solo presente en juegos con skins; GamePlayer lo llama desde el
  // <SkinSelector> que renderiza en su HUD (fuera del canvas) en
  // escritorio. En mobile, el propio juego sigue mostrando su overlay
  // interno (ver .game-skin-panel en app/globals.css).
  setSkin?: (skin: Skin) => void;
}

export interface GameComponentProps {
  onHudChange?: (state: GameHudState) => void;
}

export type GameComponent = ForwardRefExoticComponent<
  GameComponentProps & RefAttributes<GameHandle>
>;

export interface GameEntry {
  Game: GameComponent;
  Touch?: ComponentType; // controles táctiles, opcional
  showLives?: boolean; // el juego usa vidas (default true)
  showLevel?: boolean; // el juego usa niveles (default true)
}

/**
 * Registro de juegos jugables. GamePlayer.tsx busca game.id acá; si no
 * hay entrada, muestra la arena decorativa estática de siempre.
 */
export const GAME_REGISTRY: Record<string, GameEntry> = {
  asteroides: {
    Game: AsteroidsGame,
    Touch: TouchControls,
    showLives: true,
    showLevel: true,
  },
  tetris: {
    Game: TetrisGame,
    Touch: TetrisTouchControls,
    showLives: false,
    showLevel: true,
  },
  "bloque-buster": {
    Game: BloqueBusterGame,
    showLives: true,
    showLevel: true,
  },
  serpentina: {
    Game: SerpentinaGame,
    Touch: SerpentinaTouchControls,
    showLives: true,
    showLevel: true,
  },
  frogger: {
    Game: FroggerGame,
    Touch: FroggerTouchControls,
    showLives: true,
    showLevel: true,
  },
};
