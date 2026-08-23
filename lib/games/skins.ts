/**
 * Sistema de skins visuales compartido por los juegos jugables. Cada
 * `components/<Juego>Game.tsx` define su propia paleta tipada (forma
 * distinta por juego — ver ese archivo) usando este mismo tipo `Skin` y
 * estos mismos helpers de persistencia, para no reinventar el patrón en
 * cada juego.
 */
export type Skin = "clasico" | "retro" | "neon";

export const SKIN_LABELS: Record<Skin, string> = {
  clasico: "Clásico",
  retro: "Retro",
  neon: "Neón",
};

export function skinStorageKey(gameId: string) {
  return `skin:${gameId}`;
}

export function loadSkin(gameId: string): Skin {
  if (typeof window === "undefined") return "clasico";
  const raw = window.localStorage.getItem(skinStorageKey(gameId));
  return raw === "retro" || raw === "neon" ? raw : "clasico";
}

export function saveSkin(gameId: string, skin: Skin) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(skinStorageKey(gameId), skin);
}
