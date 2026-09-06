import type { NextConfig } from "next";

// Headers de seguridad aplicados a todas las respuestas (spec 11).
// No incluye Content-Security-Policy: queda para su propio spec por el riesgo
// de romper Next.js/Supabase.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      // Permite invocar Server Actions (ej. submitScore) cuando se accede a
      // la app vía un devtunnel (VS Code Port Forwarding, prueba desde el
      // celular, etc.). Contra lo intuitivo, Next.js compara el header
      // `Origin` que manda el navegador (no el `x-forwarded-host` del
      // túnel) contra esta lista — y a través de un devtunnel ese `Origin`
      // sigue reportando el host local (ej. "localhost:3000"), no el
      // dominio público del túnel. Solo aplica fuera de producción: en
      // producción el dominio real del deploy siempre es same-origin.
      allowedOrigins:
        process.env.NODE_ENV === "production"
          ? undefined
          : [
              "localhost:3000",
              "127.0.0.1:3000",
              "zkcsrvf4-3000.usw3.devtunnels.ms",
            ],
    },
  },
};

export default nextConfig;
