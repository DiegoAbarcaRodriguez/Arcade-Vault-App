"use client";

import { SKIN_LABELS, type Skin } from "@/lib/games/skins";

/**
 * `<select>` nativo estilizado con el CSS del proyecto, reusable por
 * cualquier juego con skins. Cada `<Juego>Game.tsx` lo monta como overlay
 * cerca de su propio canvas (ver `.game-skin-panel` en app/globals.css) y
 * maneja la carga/persistencia (`loadSkin`/`saveSkin`) él mismo.
 */
export default function SkinSelector({
  value,
  onChange,
}: {
  value: Skin;
  onChange: (skin: Skin) => void;
}) {
  return (
    <select
      className="skin-selector"
      value={value}
      onChange={(e) => onChange(e.target.value as Skin)}
      aria-label="Skin visual del juego"
      title="Skin visual"
    >
      {(Object.keys(SKIN_LABELS) as Skin[]).map((skin) => (
        <option key={skin} value={skin}>
          {SKIN_LABELS[skin]}
        </option>
      ))}
    </select>
  );
}
