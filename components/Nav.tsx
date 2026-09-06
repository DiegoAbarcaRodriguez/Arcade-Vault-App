"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/supabase/useProfile";
import { avatarUrl, displayName } from "@/lib/profile";
import UserBadge from "@/components/UserBadge";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { user, profile, loading } = useProfile();
  const signedIn = !!user;
  const name = displayName(profile, user);
  const avatar = avatarUrl(profile, user);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/biblioteca") {
      return (
        pathname.startsWith("/biblioteca") ||
        pathname.startsWith("/juego") ||
        pathname.startsWith("/jugar")
      );
    }
    if (href === "/acerca-de") return pathname === "/acerca-de";
    return pathname.startsWith(href);
  };

  const close = () => setOpen(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    close();
    router.refresh();
  };

  return (
    <>
      <nav className="av-nav">
        <Link href="/" className="logo" onClick={close}>
          <div className="logo-mark"></div>
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>
        <div className="links">
          <Link href="/" className={isActive("/") ? "active" : ""}>
            Inicio
          </Link>
          <Link
            href="/biblioteca"
            className={isActive("/biblioteca") ? "active" : ""}
          >
            Biblioteca
          </Link>
          <Link href="/salon" className={isActive("/salon") ? "active" : ""}>
            Salón de la Fama
          </Link>
          <Link
            href="/acerca-de"
            className={isActive("/acerca-de") ? "active" : ""}
          >
            Acerca de
          </Link>
        </div>
        <div className="spacer"></div>
        <div className="coin-counter">
          <span className="coin"></span>
          <span>CRÉDITOS · 03</span>
        </div>
        {loading ? null : signedIn ? (
          <>
            <UserBadge name={name} avatarUrl={avatar} />
            <button className="btn auth-btn" onClick={handleSignOut}>
              Cerrar Sesión
            </button>
          </>
        ) : (
          <Link href="/auth" className="btn auth-btn">
            Iniciar Sesión
          </Link>
        )}
        <button
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Menú"
        >
          ≡
        </button>
      </nav>

      <div
        className={"av-mobile-backdrop" + (open ? " open" : "")}
        onClick={close}
      ></div>
      <aside className={"av-mobile-panel" + (open ? " open" : "")}>
        <div
          className="pixel neon-cyan"
          style={{ fontSize: 11, marginBottom: 16 }}
        >
          MENÚ
        </div>
        {!loading && signedIn && (
          <div className="mobile-user">
            <UserBadge name={name} avatarUrl={avatar} email={user?.email} />
          </div>
        )}
        <Link
          href="/"
          className={isActive("/") ? "active" : ""}
          onClick={close}
        >
          Inicio
        </Link>
        <Link
          href="/biblioteca"
          className={isActive("/biblioteca") ? "active" : ""}
          onClick={close}
        >
          Biblioteca
        </Link>
        <Link
          href="/salon"
          className={isActive("/salon") ? "active" : ""}
          onClick={close}
        >
          Salón de la Fama
        </Link>
        <Link
          href="/acerca-de"
          className={isActive("/acerca-de") ? "active" : ""}
          onClick={close}
        >
          Acerca de
        </Link>
        {loading ? null : signedIn ? (
          <button className="link-btn" onClick={handleSignOut}>
            Cerrar Sesión
          </button>
        ) : (
          <Link
            href="/auth"
            className={isActive("/auth") ? "active" : ""}
            onClick={close}
          >
            Iniciar Sesión
          </Link>
        )}
        <div style={{ flex: 1 }}></div>
        <div
          className="pixel"
          style={{
            fontSize: 9,
            color: "var(--ink-faint)",
            letterSpacing: "0.16em",
          }}
        >
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
