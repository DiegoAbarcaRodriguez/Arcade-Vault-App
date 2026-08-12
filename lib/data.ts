// ===== Arcade Vault — datos compartidos =====
//
// Los juegos y los puntajes (antes mock, en GAMES/PLAYERS/seededScores) viven
// ahora en Supabase — ver lib/supabase/queries.ts (listGames/getGame/getScores).

export type Category = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export const CATS = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"] as const;
