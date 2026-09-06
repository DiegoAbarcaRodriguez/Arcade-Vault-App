"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./server";
import { getSessionUser } from "./auth";

/**
 * Guarda un puntaje real en `scores` para el usuario autenticado y revalida las
 * páginas que lo muestran (detalle del juego y salón de la fama).
 *
 * Requiere sesión: si no hay usuario, lanza y no guarda nada. El nombre que se
 * muestra en el leaderboard sale de `profiles.username` (fijado al crear la
 * cuenta, único a nivel global) vía el join por `user_id`; aquí no se toca el
 * perfil.
 *
 * Hay **una sola fila por usuario y juego** (constraint `scores_game_user_key`).
 * La RPC `submit_score` hace upsert conservando el mayor score: si el nuevo es
 * más alto lo sobrescribe (y actualiza la fecha); si no, la fila queda igual.
 */
export async function submitScore(
  gameId: string,
  score: number,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Debes iniciar sesión para guardar tu puntaje.");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_score", {
    p_game_id: gameId,
    p_score: score,
  });
  if (error) throw error;

  revalidatePath(`/juego/${gameId}`);
  revalidatePath("/salon");
}
