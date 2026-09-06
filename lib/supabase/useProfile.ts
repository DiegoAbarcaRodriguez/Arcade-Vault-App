"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";

type State = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

/**
 * Sesión + fila de `profiles` del usuario en un solo hook, reutilizable por
 * el Nav y por `GamePlayer`. Escucha `onAuthStateChange` para reaccionar a
 * login/logout sin recargar, y trae `username` + `avatar_url` del perfil.
 */
export function useProfile(): State {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<State>({
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    async function loadProfile(user: User | null): Promise<Profile | null> {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return (data as Profile | null) ?? null;
    }

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user ?? null;
      const profile = await loadProfile(user);
      if (!active) return;
      setState({ user, profile, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const user = session?.user ?? null;
        const profile = await loadProfile(user);
        if (!active) return;
        setState({ user, profile, loading: false });
      },
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}
