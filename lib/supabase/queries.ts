import { createClient } from "./server";
import type { Category } from "@/lib/data";

// ===== Tipos =====
// `Game` refleja la fila de la tabla `games` en Supabase. Vive acá (en vez
// de en lib/data.ts) mientras conviven ambas fuentes durante la migración;
// el paso de limpieza de este spec lo consolida en lib/data.ts.

export interface Game {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Category;
  cover: string;
  color: "cyan" | "magenta" | "green" | "yellow";
}

export interface GameWithStats extends Game {
  best: number; // 0 si no hay scores
  plays: number; // 0 si no hay scores
}

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string; // "DD/MM/YYYY"
}

type GameRow = {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: string;
  cover: string;
  color: string;
};

type ScoreStatsRow = { game_id: string; score: number };

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    short: row.short,
    long: row.long,
    cat: row.cat as Category,
    cover: row.cover,
    color: row.color as Game["color"],
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Lista todos los juegos con best/plays calculados en vivo desde `scores`. */
export async function listGames(): Promise<GameWithStats[]> {
  const supabase = await createClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .order("id");
  if (error) throw error;

  const { data: scores, error: scoresError } = await supabase
    .from("scores")
    .select("game_id, score");
  if (scoresError) throw scoresError;

  const statsByGame = new Map<string, { best: number; plays: number }>();
  for (const row of (scores ?? []) as ScoreStatsRow[]) {
    const stats = statsByGame.get(row.game_id) ?? { best: 0, plays: 0 };
    stats.plays += 1;
    stats.best = Math.max(stats.best, row.score);
    statsByGame.set(row.game_id, stats);
  }

  return ((games ?? []) as GameRow[]).map((row) => ({
    ...toGame(row),
    ...(statsByGame.get(row.id) ?? { best: 0, plays: 0 }),
  }));
}

/** Trae un juego por id con best/plays calculados en vivo desde `scores`. */
export async function getGame(id: string): Promise<GameWithStats | null> {
  const supabase = await createClient();

  const { data: game, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!game) return null;

  const { data: scores, error: scoresError } = await supabase
    .from("scores")
    .select("score")
    .eq("game_id", id);
  if (scoresError) throw scoresError;

  const rows = (scores ?? []) as { score: number }[];
  const best = rows.reduce((max, r) => Math.max(max, r.score), 0);
  const plays = rows.length;

  return { ...toGame(game as GameRow), best, plays };
}

/** Trae los mejores puntajes de un juego, ordenados de mayor a menor. */
export async function getScores(
  gameId: string,
  limit = 12,
): Promise<ScoreRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("player_name, score, created_at")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (
    (data ?? []) as { player_name: string; score: number; created_at: string }[]
  ).map((row, i) => ({
    rank: i + 1,
    name: row.player_name,
    score: row.score,
    date: formatDate(row.created_at),
  }));
}
