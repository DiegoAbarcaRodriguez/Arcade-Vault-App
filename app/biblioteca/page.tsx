import GameCard from "@/components/GameCard";
import { CATS } from "@/lib/data";
import { listGames } from "@/lib/supabase/queries";

export default async function Library() {
  const games = await listGames();

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>

      <div className="av-filters">
        <div className="av-search">
          <span className="ico">⌕</span>
          <input placeholder="Buscar un juego por nombre…" />
        </div>
        <div className="av-chips">
          {CATS.map((c) => (
            <button
              key={c}
              className={"chip" + (c === "TODOS" ? " active" : "")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="av-grid">
        {games.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </div>
  );
}
