"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./server";

/**
 * Guarda un puntaje real en `scores` y revalida las páginas que lo muestran
 * (detalle del juego y salón de la fama) para que se vea sin recargar en frío.
 */
export async function submitScore(
  gameId: string,
  playerName: string,
  score: number,
): Promise<void> {
  const name = playerName.trim();
  if (!name) {
    throw new Error("El nombre no puede estar vacío.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scores").insert({
    game_id: gameId,
    player_name: name,
    score,
  });
  if (error) throw error;

  revalidatePath(`/juego/${gameId}`);
  revalidatePath("/salon");
}
