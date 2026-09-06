"use client";

import { useState } from "react";
import { initials } from "@/lib/profile";

type Props = {
  name: string;
  avatarUrl: string | null;
  /** Muestra el correo debajo del nombre (panel móvil). */
  email?: string | null;
};

export default function UserBadge({ name, avatarUrl, email }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = avatarUrl && !imgFailed;

  return (
    <div className="user-badge">
      {showImg ? (
        // proveedor OAuth; evita configurar remotePatterns para lh3/github.
        <img
          className="avatar"
          src={avatarUrl}
          alt={name}
          title={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="avatar initials" title={name} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      <span className="who">
        <span className="name" title={name}>
          {name}
        </span>
        {email && (
          <span className="email" title={email}>
            {email}
          </span>
        )}
      </span>
    </div>
  );
}
