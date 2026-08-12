"use client";

import { useRef } from "react";
import Link from "next/link";
import type { GameWithStats } from "@/lib/supabase/queries";

export default function GameCard({ game }: { game: GameWithStats }) {
  const tiltRef = useRef<HTMLAnchorElement>(null);

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-6px) rotateX(${-py * 6}deg) rotateY(${px * 8}deg)`;
  };

  const onLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.transform = "";
  };

  return (
    <Link
      ref={tiltRef}
      href={`/juego/${game.id}`}
      className="card"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="cover">
        <div className={"cover-bg " + game.cover}></div>
        <div className="label">{game.cat}</div>
      </div>
      <div className="meta">
        <div className="title">{game.title}</div>
        <div className="desc">{game.short}</div>
        <div className="row">
          <div className="score-badge">
            <span>MEJOR PUNTUACIÓN</span>
            <b>{game.best.toLocaleString("es-ES")}</b>
          </div>
          <span
            className={
              "btn " +
              (game.color === "magenta"
                ? "magenta"
                : game.color === "yellow"
                  ? "yellow"
                  : "")
            }
          >
            JUGAR
          </span>
        </div>
      </div>
    </Link>
  );
}
