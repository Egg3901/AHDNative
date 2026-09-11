import { useEffect, useRef } from "react";
import { LAND_DOTS } from "./landDots";
import type { ReducedMotion } from "../preferences";

/* Canvas orthographic dot globe for the landing hero.
 * Minimal polished space look: deep-navy ocean disc, small cool-white
 * geographic land dots, faint graticule, soft atmospheric blue rim, sparse
 * delicate starfield. Rendered with the bundled offline dot geography and the
 * AHDClient canvas approach: all frame work is imperative (refs +
 * requestAnimationFrame), no per-frame React state. DPR is capped at 2 and
 * frames at ~30fps. No labels; the globe is decorative and stays readable.
 */

export interface LandingGlobeProps {
  reducedMotion: ReducedMotion;
  /** Kept for API compatibility; the polished globe uses its own cool rim. */
  accent?: string;
  label?: string;
}

const DEG = Math.PI / 180;
const SPIN_RAD_PER_SECOND = 3.6 * DEG;
const FRAME_MIN_MS = 1000 / 30;
/** Center the Atlantic so the Americas, Europe and Africa read on load. */
const INITIAL_ROTATION = 30 * DEG;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star { x: number; y: number; r: number; a: number }

function buildStars(count: number, seed: number): Star[] {
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand(),
      y: rand(),
      r: 0.3 + rand() * 0.7,
      a: 0.25 + rand() * 0.5,
    });
  }
  return stars;
}

export function LandingGlobe({ reducedMotion, accent, label = "World map" }: LandingGlobeProps) {
  void accent;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = reducedMotion === "on" || (reducedMotion === "system" && media.matches);
    let size = 0;
    let dpr = 1;
    let raf = 0;
    let running = false;
    let visible = !document.hidden;
    let onScreen = true;
    let rot = INITIAL_ROTATION;
    let last = performance.now();
    let stars: Star[] = [];

    function resize(): void {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.max(0, wrap!.clientWidth);
      canvas!.width = Math.max(1, Math.round(size * dpr));
      canvas!.height = Math.max(1, Math.round(size * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = buildStars(Math.round(36 + size * 0.16), 1337);
    }

    function drawFrame(): void {
      const S = size;
      if (S <= 0) return;
      const cx = S / 2;
      const cy = S / 2;
      const R = S * 0.42;
      ctx!.clearRect(0, 0, S, S);

      for (const star of stars) {
        const dx = (star.x * S - cx) / R;
        const dy = (star.y * S - cy) / R;
        if (dx * dx + dy * dy < 1.21) continue;
        ctx!.fillStyle = `rgba(214,224,255,${(star.a * 0.7).toFixed(3)})`;
        ctx!.beginPath();
        ctx!.arc(star.x * S, star.y * S, star.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      const atmosphere = ctx!.createRadialGradient(cx, cy, R * 0.99, cx, cy, R * 1.15);
      atmosphere.addColorStop(0, "rgba(129,150,245,0.24)");
      atmosphere.addColorStop(0.24, "rgba(108,128,235,0.09)");
      atmosphere.addColorStop(1, "rgba(99,102,241,0)");
      ctx!.fillStyle = atmosphere;
      ctx!.fillRect(0, 0, S, S);
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.clip();
      const ocean = ctx!.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      ocean.addColorStop(0, "#223154");
      ocean.addColorStop(0.55, "#141d38");
      ocean.addColorStop(1, "#0a1024");
      ctx!.fillStyle = ocean;
      ctx!.fillRect(0, 0, S, S);

      ctx!.strokeStyle = "rgba(190,205,245,0.07)";
      ctx!.lineWidth = Math.max(0.6, S / 480);
      for (let p = -60; p <= 60; p += 30) {
        const lat = p * DEG;
        const y = cy - R * Math.sin(lat);
        const rx = R * Math.cos(lat);
        ctx!.beginPath();
        ctx!.ellipse(cx, y, rx, rx * 0.16, 0, 0, Math.PI * 2);
        ctx!.stroke();
      }
      for (let m = 0; m < 6; m++) {
        const lon0 = rot + (m * Math.PI) / 3;
        ctx!.beginPath();
        let started = false;
        for (let t = -90; t <= 90; t += 4) {
          const lat = t * DEG;
          const x3 = Math.cos(lat) * Math.sin(lon0);
          const y3 = Math.sin(lat);
          const z3 = Math.cos(lat) * Math.cos(lon0);
          if (z3 < 0) {
            started = false;
            continue;
          }
          const x = cx + R * x3;
          const y = cy - R * y3;
          if (!started) {
            ctx!.moveTo(x, y);
            started = true;
          } else {
            ctx!.lineTo(x, y);
          }
        }
        ctx!.stroke();
      }

      const dotScale = Math.min(1.1, Math.max(0.6, S / 340));
      for (let i = 0; i < LAND_DOTS.length; i++) {
        const dot = LAND_DOTS[i]!;
        const lon = dot[0] * DEG + rot;
        const lat = dot[1] * DEG;
        const cosLat = Math.cos(lat);
        const x3 = cosLat * Math.sin(lon);
        const y3 = Math.sin(lat);
        const z3 = cosLat * Math.cos(lon);
        if (z3 < 0.05) continue;
        ctx!.fillStyle = "#d9e3ff";
        ctx!.globalAlpha = 0.2 + z3 * 0.5;
        ctx!.beginPath();
        ctx!.arc(cx + R * x3, cy - R * y3, (0.5 + z3 * 0.7) * dotScale, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      const shade = ctx!.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
      shade.addColorStop(0, "rgba(2,6,18,0)");
      shade.addColorStop(0.78, "rgba(2,6,18,0)");
      shade.addColorStop(1, "rgba(2,6,18,0.45)");
      ctx!.fillStyle = shade;
      ctx!.fillRect(0, 0, S, S);
      const sheen = ctx!.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx - R * 0.4, cy - R * 0.45, R * 0.9);
      sheen.addColorStop(0, "rgba(165,180,255,0.10)");
      sheen.addColorStop(1, "rgba(165,180,255,0)");
      ctx!.fillStyle = sheen;
      ctx!.fillRect(0, 0, S, S);
      ctx!.restore();

      ctx!.save();
      ctx!.strokeStyle = "rgba(205,215,255,0.35)";
      ctx!.lineWidth = Math.max(0.8, S / 420);
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();
    }

    function frame(now: number): void {
      raf = 0;
      if (!running) return;
      if (now - last < FRAME_MIN_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      rot += dt * SPIN_RAD_PER_SECOND;
      drawFrame();
      raf = requestAnimationFrame(frame);
    }

    function updateRunning(): void {
      const shouldRun = !reduceMotion && visible && onScreen;
      if (shouldRun && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function onVisibility(): void {
      visible = !document.hidden;
      if (visible && !reduceMotion) {
        last = performance.now();
        drawFrame();
      }
      updateRunning();
    }

    function onMotionChange(event: MediaQueryListEvent): void {
      if (reducedMotion !== "system") return;
      reduceMotion = event.matches;
      if (reduceMotion) {
        updateRunning();
        drawFrame();
      } else {
        last = performance.now();
        updateRunning();
      }
    }

    resize();
    drawFrame();
    updateRunning();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      drawFrame();
    });
    resizeObserver.observe(wrap);
    const screenObserver = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting !== false;
        updateRunning();
      },
      { threshold: 0 },
    );
    screenObserver.observe(wrap);
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onMotionChange);
    }

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      screenObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onMotionChange);
      }
    };
  }, [reducedMotion, accent]);

  return (
    <div ref={wrapRef} className="ahd-landing-globe" role="img" aria-label={label}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
