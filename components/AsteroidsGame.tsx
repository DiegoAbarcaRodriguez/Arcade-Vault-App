"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  GameComponentProps,
  GameHandle,
  GameHudState,
} from "@/components/games/registry";
import { loadSkin, saveSkin, type Skin } from "@/lib/games/skins";
import SkinSelector from "@/components/games/SkinSelector";

// Resolución lógica fija del juego (ver spec 05, decisión de escalado por CSS).
const W = 800;
const H = 600;

/**
 * Roles de color que necesita el motor de Asteroids: nave, disparo,
 * asteroide, power-up, partículas de explosión, HUD y overlays de
 * pausa/game-over. Cada skin es un objeto con esta misma forma.
 */
interface AsteroidsPalette {
  background: string; // fondo del canvas (fillRect de cada frame)
  ship: string; // trazo de la nave y del ícono de "vida" del HUD
  shipThrust: string; // llama del propulsor
  bullet: string; // disparos
  asteroid: string; // trazo de los asteroides
  particle: string; // partículas de explosión (alpha aplicado en draw())
  powerup: string; // power-up de disparo triple (ícono + etiqueta "3x")
  hudText: string; // texto principal del HUD (score/nivel)
  hudAccent: string; // indicador "3x Ns" del HUD
  overlayTitle: string; // título "GAME OVER"/"PAUSADO"
  overlaySub: string; // subtítulo del overlay (alpha aplicado en draw())
  glowBlur: number; // shadowBlur (px) aplicado a los trazos principales
}

// `clasico` es el look original del juego (spec 05): los mismos literales
// que ya estaban hardcodeados en ctx.fillStyle/strokeStyle antes de este
// cambio, solo movidos a esta estructura — no es un rediseño.
const SKINS: Record<Skin, AsteroidsPalette> = {
  clasico: {
    background: "#000000",
    ship: "#ffffff",
    shipThrust: "#ff8200",
    bullet: "#ffffff",
    asteroid: "#ffffff",
    particle: "#ffffff",
    powerup: "#00ffff",
    hudText: "#ffffff",
    hudAccent: "#00ffff",
    overlayTitle: "#ffffff",
    overlaySub: "#ffffff",
    glowBlur: 0,
  },
  // Fósforo verde/ámbar de monitor CRT de 8-bit: paleta reducida a dos
  // tonos con glow (shadowBlur/shadowColor en draw()) para que el verde
  // no quede plano contra el fondo negro del canvas.
  retro: {
    background: "#000000",
    ship: "#33ff33",
    shipThrust: "#ffb000",
    bullet: "#33ff33",
    asteroid: "#33ff33",
    particle: "#33ff33",
    powerup: "#ffb000",
    hudText: "#33ff33",
    hudAccent: "#ffb000",
    overlayTitle: "#33ff33",
    overlaySub: "#33ff33",
    glowBlur: 8,
  },
  // Synthwave/arcade neón: reusa los mismos hex que app/globals.css usa
  // para --cyan/--magenta/--yellow/--green.
  neon: {
    background: "#000000",
    ship: "#00f5ff",
    shipThrust: "#ff006e",
    bullet: "#f5ff00",
    asteroid: "#ff006e",
    particle: "#00f5ff",
    powerup: "#00ff88",
    hudText: "#00f5ff",
    hudAccent: "#00ff88",
    overlayTitle: "#ff006e",
    overlaySub: "#00f5ff",
    glowBlur: 6,
  },
};

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * Port de resources/02-asteroids/game.js. Toda la lógica del motor
 * (input, clases, loop, colisiones) vive encapsulada dentro del
 * useEffect: cada montaje del componente crea su propio estado
 * aislado, sin globals compartidos entre instancias.
 */
const AsteroidsGame = forwardRef<GameHandle, GameComponentProps>(
  function AsteroidsGame({ onHudChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Ref para que el loop siempre invoque el callback más reciente sin
    // tener que reiniciar el motor cuando el padre pasa una nueva función.
    const onHudChangeRef = useRef(onHudChange);
    useEffect(() => {
      onHudChangeRef.current = onHudChange;
    }, [onHudChange]);

    // Los métodos reales se asignan dentro del useEffect (cierran sobre el
    // estado mutable del motor); este ref los expone hacia afuera sin tener
    // que reiniciar el motor cuando el componente padre se re-renderiza.
    const controlsRef = useRef<GameHandle>({
      togglePause: () => {},
      forceGameOver: () => {},
    });
    useImperativeHandle(ref, () => ({
      togglePause: () => controlsRef.current.togglePause(),
      forceGameOver: () => controlsRef.current.forceGameOver(),
      setSkin: handleSkinChange,
    }));

    // Skin activa: estado de React (para el <select>, y para persistirla)
    // más un ref (para que el loop del motor, que corre dentro de un
    // useEffect con deps vacías, siempre lea la paleta más reciente sin
    // que cambiar de skin reinicie la partida en curso).
    const [skin, setSkin] = useState<Skin>(() => loadSkin("asteroides"));
    const paletteRef = useRef<AsteroidsPalette>(SKINS[skin]);
    const skinRef = useRef<Skin>(skin);
    useEffect(() => {
      paletteRef.current = SKINS[skin];
      skinRef.current = skin;
    }, [skin]);

    const handleSkinChange = (next: Skin) => {
      setSkin(next);
      saveSkin("asteroides", next);
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ── Input ────────────────────────────────────────────────────────────
      const keys: Record<string, boolean> = {};
      const justPressed: Record<string, boolean> = {};
      // Teclas que el juego controla: sin preventDefault(), el navegador
      // hace scroll de la página con las flechas y con espacio.
      const GAME_KEYS = new Set([
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Space",
      ]);

      const handleKeyDown = (e: KeyboardEvent) => {
        // Atajo de pausa: no depende de GAME_KEYS ni del estado
        // playing/paused/dead/gameover — llama al mismo togglePause()
        // que usa el botón PAUSA del HUD externo. Se ignora el
        // auto-repeat del navegador (mismo patrón que las demás teclas).
        if (e.code === "KeyP") {
          if (!keys[e.code]) controlsRef.current.togglePause();
          keys[e.code] = true;
          return;
        }
        if (!GAME_KEYS.has(e.code)) return;
        e.preventDefault();
        if (!keys[e.code]) justPressed[e.code] = true;
        keys[e.code] = true;
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "KeyP") {
          keys[e.code] = false;
          return;
        }
        if (!GAME_KEYS.has(e.code)) return;
        e.preventDefault();
        keys[e.code] = false;
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      function pressed(code: string) {
        const val = justPressed[code];
        justPressed[code] = false;
        return val;
      }

      // ── Utils ────────────────────────────────────────────────────────────
      const wrap = (v: number, max: number) => ((v % max) + max) % max;
      const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      const rand = (min: number, max: number) =>
        min + Math.random() * (max - min);
      const randInt = (min: number, max: number) =>
        Math.floor(rand(min, max + 1));

      // ── Constants ────────────────────────────────────────────────────────
      const POWERUP_DROP_CHANCE = 0.15;
      const POWERUP_DURATION = 5;
      const POWERUP_TTL = 12;
      const TRIPLE_SPREAD = 0.18;

      // ── Bullet ───────────────────────────────────────────────────────────
      class Bullet {
        x: number;
        y: number;
        vx: number;
        vy: number;
        ttl = 1.1;
        radius = 2;
        dead = false;

        constructor(x: number, y: number, angle: number) {
          this.x = x;
          this.y = y;
          const SPEED = 520;
          this.vx = Math.cos(angle) * SPEED;
          this.vy = Math.sin(angle) * SPEED;
        }

        update(dt: number) {
          this.x = wrap(this.x + this.vx * dt, W);
          this.y = wrap(this.y + this.vy * dt, H);
          this.ttl -= dt;
          if (this.ttl <= 0) this.dead = true;
        }

        draw() {
          ctx!.fillStyle = paletteRef.current.bullet;
          ctx!.beginPath();
          ctx!.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // ── Asteroid ─────────────────────────────────────────────────────────
      const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
      const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
      const POINTS = [0, 100, 50, 20]; // puntos por tamaño

      class Asteroid {
        x: number;
        y: number;
        size: number;
        radius: number;
        dead = false;
        vx: number;
        vy: number;
        rotSpeed: number;
        rot: number;
        verts: [number, number][] = [];

        constructor(x: number, y: number, size = 3) {
          this.x = x;
          this.y = y;
          this.size = size;
          this.radius = RADII[size];

          const angle = rand(0, Math.PI * 2);
          const speed = SPEEDS[size] + rand(-15, 15);
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.rotSpeed = rand(-1.2, 1.2);
          this.rot = rand(0, Math.PI * 2);

          // Polígono irregular
          const n = randInt(8, 13);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = this.radius * rand(0.6, 1.0);
            this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
          }
        }

        update(dt: number) {
          this.x = wrap(this.x + this.vx * dt, W);
          this.y = wrap(this.y + this.vy * dt, H);
          this.rot += this.rotSpeed * dt;
        }

        split(): Asteroid[] {
          if (this.size <= 1) return [];
          return [
            new Asteroid(this.x, this.y, this.size - 1),
            new Asteroid(this.x, this.y, this.size - 1),
          ];
        }

        draw() {
          const palette = paletteRef.current;
          ctx!.save();
          ctx!.translate(this.x, this.y);
          ctx!.rotate(this.rot);
          ctx!.strokeStyle = palette.asteroid;
          ctx!.lineWidth = 1.5;
          ctx!.lineJoin = "round";
          ctx!.shadowBlur = palette.glowBlur;
          ctx!.shadowColor = palette.asteroid;
          ctx!.beginPath();
          ctx!.moveTo(this.verts[0][0], this.verts[0][1]);
          for (let i = 1; i < this.verts.length; i++)
            ctx!.lineTo(this.verts[i][0], this.verts[i][1]);
          ctx!.closePath();
          ctx!.stroke();
          ctx!.restore();
        }
      }

      // ── PowerUp ──────────────────────────────────────────────────────────
      class PowerUp {
        x: number;
        y: number;
        vx: number;
        vy: number;
        radius = 12;
        ttl = POWERUP_TTL;
        dead = false;

        constructor(x: number, y: number) {
          this.x = x;
          this.y = y;
          const angle = rand(0, Math.PI * 2);
          const speed = rand(20, 40);
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
        }

        update(dt: number) {
          this.x = wrap(this.x + this.vx * dt, W);
          this.y = wrap(this.y + this.vy * dt, H);
          this.ttl -= dt;
          if (this.ttl <= 0) this.dead = true;
        }

        draw() {
          if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
          const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
          ctx!.save();
          ctx!.translate(this.x, this.y);
          ctx!.rotate(Math.PI / 4);
          ctx!.strokeStyle = paletteRef.current.powerup;
          ctx!.lineWidth = 2;
          const r = this.radius * pulse;
          ctx!.strokeRect(-r, -r, r * 2, r * 2);
          ctx!.restore();
          ctx!.fillStyle = paletteRef.current.powerup;
          ctx!.font = "bold 12px monospace";
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText("3x", this.x, this.y);
        }
      }

      // ── Ship ─────────────────────────────────────────────────────────────
      class Ship {
        x = 0;
        y = 0;
        angle = 0;
        vx = 0;
        vy = 0;
        radius = 12;
        thrusting = false;
        invincible = 0;
        shootCooldown = 0;
        dead = false;
        tripleShot = 0;

        constructor() {
          this.reset();
        }

        reset() {
          this.x = W / 2;
          this.y = H / 2;
          this.angle = -Math.PI / 2;
          this.vx = 0;
          this.vy = 0;
          this.thrusting = false;
          this.invincible = 3;
          this.shootCooldown = 0;
          this.dead = false;
        }

        update(dt: number) {
          if (this.dead) return;
          if (this.invincible > 0) this.invincible -= dt;
          if (this.shootCooldown > 0) this.shootCooldown -= dt;
          if (this.tripleShot > 0) this.tripleShot -= dt;

          const ROT = 3.5; // rad/s
          const THRUST = 260; // px/s²
          const DRAG = 0.987;

          if (keys["ArrowLeft"]) this.angle -= ROT * dt;
          if (keys["ArrowRight"]) this.angle += ROT * dt;

          this.thrusting = !!keys["ArrowUp"];
          if (this.thrusting) {
            this.vx += Math.cos(this.angle) * THRUST * dt;
            this.vy += Math.sin(this.angle) * THRUST * dt;
          }

          this.vx *= DRAG;
          this.vy *= DRAG;
          this.x = wrap(this.x + this.vx * dt, W);
          this.y = wrap(this.y + this.vy * dt, H);
        }

        tryShoot(): Bullet[] {
          if (this.shootCooldown > 0 || this.dead) return [];
          this.shootCooldown = 0.2;
          const NOSE = 21;
          const ox = this.x + Math.cos(this.angle) * NOSE;
          const oy = this.y + Math.sin(this.angle) * NOSE;
          if (this.tripleShot > 0) {
            return [
              new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
              new Bullet(ox, oy, this.angle),
              new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
            ];
          }
          return [new Bullet(ox, oy, this.angle)];
        }

        draw() {
          if (this.dead) return;
          // Parpadeo durante invencibilidad de reaparición
          if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0)
            return;

          const palette = paletteRef.current;
          ctx!.save();
          ctx!.translate(this.x, this.y);
          ctx!.rotate(this.angle);
          ctx!.strokeStyle = palette.ship;
          ctx!.lineWidth = 1.5;
          ctx!.lineJoin = "round";
          ctx!.shadowBlur = palette.glowBlur;
          ctx!.shadowColor = palette.ship;

          // Silueta clásica: triángulo con muesca trasera
          ctx!.beginPath();
          ctx!.moveTo(20, 0); // nariz
          ctx!.lineTo(-12, -9); // ala izquierda
          ctx!.lineTo(-7, 0); // muesca trasera
          ctx!.lineTo(-12, 9); // ala derecha
          ctx!.closePath();
          ctx!.stroke();

          // Llama del propulsor
          if (this.thrusting && Math.random() > 0.35) {
            ctx!.beginPath();
            ctx!.moveTo(-8, -4);
            ctx!.lineTo(-8 - rand(6, 14), 0);
            ctx!.lineTo(-8, 4);
            ctx!.strokeStyle = `rgba(${hexToRgb(palette.shipThrust)}, 0.85)`;
            ctx!.shadowColor = palette.shipThrust;
            ctx!.stroke();
          }

          ctx!.restore();
        }
      }

      // ── Partículas (explosión) ──────────────────────────────────────────
      class Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;
        life: number;
        ttl: number;
        dead = false;

        constructor(x: number, y: number) {
          this.x = x;
          this.y = y;
          const angle = rand(0, Math.PI * 2);
          const speed = rand(30, 130);
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.life = rand(0.4, 1.1);
          this.ttl = this.life;
        }

        update(dt: number) {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          this.ttl -= dt;
          if (this.ttl <= 0) this.dead = true;
        }

        draw() {
          const alpha = this.ttl / this.life;
          const palette = paletteRef.current;
          ctx!.strokeStyle = `rgba(${hexToRgb(palette.particle)},${alpha.toFixed(2)})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(this.x, this.y);
          ctx!.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
          ctx!.stroke();
        }
      }

      // ── Estado del juego ─────────────────────────────────────────────────
      let ship: Ship;
      let bullets: Bullet[] = [];
      let asteroids: Asteroid[] = [];
      let particles: Particle[] = [];
      let powerUps: PowerUp[] = [];
      let score = 0;
      let lives = 3;
      let level = 1;
      let phase: "playing" | "paused" | "dead" | "gameover" = "playing";
      let deadTimer = 0;
      let powerUpSpawned = false;
      let killsSinceSpawn = 0;

      function spawnAsteroids(count: number) {
        const SAFE_DIST = 130;
        for (let i = 0; i < count; i++) {
          let x: number, y: number;
          do {
            x = rand(0, W);
            y = rand(0, H);
          } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
          asteroids.push(new Asteroid(x, y, 3));
        }
      }

      function initGame() {
        ship = new Ship();
        bullets = [];
        asteroids = [];
        particles = [];
        powerUps = [];
        powerUpSpawned = false;
        killsSinceSpawn = 0;
        score = 0;
        lives = 3;
        level = 1;
        phase = "playing";
        spawnAsteroids(4);
      }

      function nextLevel() {
        level++;
        bullets = [];
        particles = [];
        powerUps = [];
        powerUpSpawned = false;
        killsSinceSpawn = 0;
        ship.reset();
        spawnAsteroids(3 + level);
      }

      function explode(x: number, y: number, count = 8) {
        for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
      }

      function killShip() {
        explode(ship.x, ship.y, 14);
        ship.dead = true;
        lives--;
        if (lives <= 0) {
          phase = "gameover";
        } else {
          phase = "dead";
          deadTimer = 2;
        }
      }

      // ── Update ───────────────────────────────────────────────────────────
      function update(dt: number) {
        if (phase === "paused") return; // congela física/colisiones; draw() sigue corriendo

        if (phase === "gameover") {
          if (pressed("Space")) initGame();
          particles.forEach((p) => p.update(dt));
          particles = particles.filter((p) => !p.dead);
          return;
        }

        if (phase === "dead") {
          deadTimer -= dt;
          particles.forEach((p) => p.update(dt));
          particles = particles.filter((p) => !p.dead);
          asteroids.forEach((a) => a.update(dt));
          if (deadTimer <= 0) {
            phase = "playing";
            ship.reset();
          }
          return;
        }

        // Disparar
        if (pressed("Space")) {
          bullets.push(...ship.tryShoot());
        }

        ship.update(dt);
        bullets.forEach((b) => b.update(dt));
        asteroids.forEach((a) => a.update(dt));
        particles.forEach((p) => p.update(dt));
        powerUps.forEach((p) => p.update(dt));

        bullets = bullets.filter((b) => !b.dead);
        particles = particles.filter((p) => !p.dead);
        powerUps = powerUps.filter((p) => !p.dead);

        for (const p of powerUps) {
          if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
            p.dead = true;
            ship.tripleShot = POWERUP_DURATION;
          }
        }

        // Bala vs asteroide
        const newAsteroids: Asteroid[] = [];
        for (const b of bullets) {
          for (const a of asteroids) {
            if (!a.dead && !b.dead && dist(b, a) < a.radius) {
              b.dead = true;
              a.dead = true;
              score += POINTS[a.size];
              explode(a.x, a.y, a.size * 5);
              newAsteroids.push(...a.split());
              if (!powerUpSpawned) {
                killsSinceSpawn++;
                const guaranteed = killsSinceSpawn >= 5;
                if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
                  powerUps.push(new PowerUp(a.x, a.y));
                  powerUpSpawned = true;
                }
              }
            }
          }
        }
        asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
        bullets = bullets.filter((b) => !b.dead);

        // Nave vs asteroide
        if (ship.invincible <= 0) {
          for (const a of asteroids) {
            if (dist(ship, a) < ship.radius + a.radius * 0.82) {
              killShip();
              break;
            }
          }
        }

        // Nivel completado
        if (asteroids.length === 0) nextLevel();
      }

      // ── Draw ─────────────────────────────────────────────────────────────
      function drawLifeIcon(x: number, y: number) {
        const palette = paletteRef.current;
        ctx!.save();
        ctx!.translate(x, y);
        ctx!.rotate(-Math.PI / 2);
        ctx!.strokeStyle = palette.ship;
        ctx!.lineWidth = 1.2;
        ctx!.lineJoin = "round";
        ctx!.beginPath();
        ctx!.moveTo(9, 0);
        ctx!.lineTo(-6, -5);
        ctx!.lineTo(-3, 0);
        ctx!.lineTo(-6, 5);
        ctx!.closePath();
        ctx!.stroke();
        ctx!.restore();
      }

      function drawHUD() {
        const palette = paletteRef.current;
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = palette.hudText;
        ctx!.font = "15px monospace";

        ctx!.textAlign = "left";
        ctx!.fillText(`SCORE  ${score}`, 14, 26);

        ctx!.textAlign = "center";
        ctx!.fillText(`NIVEL ${level}`, W / 2, 26);

        for (let i = 0; i < lives; i++) drawLifeIcon(W - 16 - i * 22, 18);

        if (ship.tripleShot > 0) {
          ctx!.textAlign = "left";
          ctx!.fillStyle = palette.hudAccent;
          ctx!.fillText(`3x  ${ship.tripleShot.toFixed(1)}s`, 14, 46);
        }
      }

      function drawOverlay(title: string, sub: string) {
        const palette = paletteRef.current;
        ctx!.textAlign = "center";
        ctx!.fillStyle = palette.overlayTitle;
        ctx!.font = "bold 46px monospace";
        ctx!.fillText(title, W / 2, H / 2 - 18);
        ctx!.font = "18px monospace";
        ctx!.fillStyle = `rgba(${hexToRgb(palette.overlaySub)},0.65)`;
        ctx!.fillText(sub, W / 2, H / 2 + 22);
      }

      function draw() {
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = paletteRef.current.background;
        ctx!.fillRect(0, 0, W, H);

        particles.forEach((p) => p.draw());
        asteroids.forEach((a) => a.draw());
        powerUps.forEach((p) => p.draw());
        bullets.forEach((b) => b.draw());
        ship.draw();

        drawHUD();

        if (phase === "gameover")
          drawOverlay(
            "GAME OVER",
            `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`,
          );

        if (phase === "paused")
          drawOverlay("PAUSADO", "PRESIONÁ PAUSA PARA REANUDAR");
      }

      // ── HUD externo ──────────────────────────────────────────────────────
      // Se reporta hacia afuera solo cuando algún valor relevante cambia,
      // no en cada frame, para no forzar renders de React a 60fps.
      let lastHud: GameHudState | null = null;
      function reportHud() {
        const tripleShotSeconds = Number(ship.tripleShot.toFixed(1));
        const next: GameHudState = {
          score,
          lives,
          level,
          phase,
          extra: { tripleShotSeconds },
          skin: skinRef.current,
        };
        if (
          !lastHud ||
          lastHud.score !== next.score ||
          lastHud.lives !== next.lives ||
          lastHud.level !== next.level ||
          lastHud.phase !== next.phase ||
          lastHud.skin !== next.skin ||
          lastHud.extra?.tripleShotSeconds !== tripleShotSeconds
        ) {
          lastHud = next;
          onHudChangeRef.current?.(next);
        }
      }

      // ── Controles externos (PAUSA / FIN) ─────────────────────────────────
      // La pantalla completa la maneja GamePlayer.tsx directamente sobre el
      // contenedor .crt-screen (no sobre este canvas): así entran a la
      // capa de fullscreen tanto el canvas como los TouchControls, que son
      // hermanos suyos en el DOM.
      controlsRef.current.togglePause = () => {
        if (phase === "playing") {
          phase = "paused";
        } else if (phase === "paused") {
          phase = "playing";
        }
        // Pausar/reanudar durante "dead" o "gameover" no tiene efecto: no
        // tiene sentido pausar la animación de muerte ni la pantalla final.
        reportHud();
      };

      controlsRef.current.forceGameOver = () => {
        if (phase === "gameover") return;
        explode(ship.x, ship.y, 14);
        ship.dead = true;
        lives = 0;
        phase = "gameover";
        reportHud();
      };

      // ── Loop principal ───────────────────────────────────────────────────
      let rafId = 0;
      let lastTime: number | null = null;

      function loop(ts: number) {
        const dt =
          lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;
        update(dt);
        draw();
        reportHud();
        rafId = requestAnimationFrame(loop);
      }

      initGame();
      reportHud();
      rafId = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    return (
      <div className="game-arena game-arena-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
        <div className="game-skin-panel">
          <SkinSelector value={skin} onChange={handleSkinChange} />
        </div>
      </div>
    );
  },
);

export default AsteroidsGame;
