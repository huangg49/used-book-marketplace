import { useEffect, useRef } from "react";
import styles from "./AutumnLeavesCanvas.module.css";

interface Leaf {
  x: number;
  y: number;
  z: number; // 0.4 to 1.0 (depth)
  type: 0 | 1 | 2; // 0: Maple, 1: Oak, 2: Birch
  color: string;
  darkColor: string;
  size: number;
  rotation: number;
  rotSpeed: number;
  flip: number;
  flipSpeed: number;
  swayFreq: number;
  swayAmp: number;
  phase: number;
  fallSpeed: number;
}

const PALETTE = [
  { color: "#e8853b", dark: "#b85c1f" }, // Warm Amber / Ochre
  { color: "#f4cb67", dark: "#c79e3a" }, // Lật Lại Gold Honey
  { color: "#c94628", dark: "#962a14" }, // Rust Terracotta
  { color: "#8a201c", dark: "#631310" }, // Lật Lại Deep Wine
  { color: "#cda043", dark: "#9c7625" }, // Golden Olive
  { color: "#d96534", dark: "#a34318" }, // Burnt Coral
];

// Vector drawing helpers centered at (0, 0)
function drawBirchLeaf(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.52;
  const h = size * 0.95;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.5);
  ctx.bezierCurveTo(w * 0.8, -h * 0.35, w * 0.9, h * 0.1, 0, h * 0.5);
  ctx.bezierCurveTo(-w * 0.9, h * 0.1, -w * 0.8, -h * 0.35, 0, -h * 0.5);
  ctx.closePath();
  ctx.fill();

  // Stem & central vein
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.35);
  ctx.lineTo(0, h * 0.65);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawOakLeaf(ctx: CanvasRenderingContext2D, size: number) {
  const w = size * 0.48;
  const h = size;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.5);
  // Right lobes
  ctx.bezierCurveTo(w * 0.5, -h * 0.42, w * 0.8, -h * 0.32, w * 0.4, -h * 0.22);
  ctx.bezierCurveTo(w * 0.9, -h * 0.12, w * 0.95, h * 0.05, w * 0.45, h * 0.15);
  ctx.bezierCurveTo(w * 0.8, h * 0.25, w * 0.7, h * 0.38, 0, h * 0.48);
  // Left lobes
  ctx.bezierCurveTo(-w * 0.7, h * 0.38, -w * 0.8, h * 0.25, -w * 0.45, h * 0.15);
  ctx.bezierCurveTo(-w * 0.95, h * 0.05, -w * 0.9, -h * 0.12, -w * 0.4, -h * 0.22);
  ctx.bezierCurveTo(-w * 0.8, -h * 0.32, -w * 0.5, -h * 0.42, 0, -h * 0.5);
  ctx.closePath();
  ctx.fill();

  // Stem
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.38);
  ctx.lineTo(0, h * 0.62);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMapleLeaf(ctx: CanvasRenderingContext2D, size: number) {
  const s = size * 0.55;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.05); // Top tip
  ctx.lineTo(s * 0.28, -s * 0.65);
  ctx.lineTo(s * 0.55, -s * 0.75); // Top right mini
  ctx.lineTo(s * 0.45, -s * 0.35);
  ctx.lineTo(s * 0.95, -s * 0.22); // Right main
  ctx.lineTo(s * 0.65, s * 0.1);
  ctx.lineTo(s * 0.75, s * 0.35); // Bottom right
  ctx.lineTo(s * 0.32, s * 0.38);
  ctx.lineTo(0, s * 0.6); // Base notch
  ctx.lineTo(-s * 0.32, s * 0.38);
  ctx.lineTo(-s * 0.75, s * 0.35); // Bottom left
  ctx.lineTo(-s * 0.65, s * 0.1);
  ctx.lineTo(-s * 0.95, -s * 0.22); // Left main
  ctx.lineTo(-s * 0.45, -s * 0.35);
  ctx.lineTo(-s * 0.55, -s * 0.75); // Top left mini
  ctx.lineTo(-s * 0.28, -s * 0.65);
  ctx.closePath();
  ctx.fill();

  // Stem
  ctx.beginPath();
  ctx.moveTo(0, s * 0.1);
  ctx.lineTo(0, s * 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function AutumnLeavesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let isVisible = true;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Resize handling
    const updateSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    updateSize();

    // Leaf pool creation
    const leafCount = width < 768 ? 24 : 42;
    const leaves: Leaf[] = [];

    const initLeaf = (_leaf?: Leaf | null, startAnywhere = false): Leaf => {
      const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const z = 0.45 + Math.random() * 0.55; // 0.45 to 1.0 depth
      const size = (18 + Math.random() * 14) * (0.6 + 0.4 * z);

      return {
        x: Math.random() * width,
        y: startAnywhere ? Math.random() * height : -size - Math.random() * 100,
        z,
        type: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        color: palette.color,
        darkColor: palette.dark,
        size,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.025,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 0.015 + Math.random() * 0.03,
        swayFreq: 0.0015 + Math.random() * 0.002,
        swayAmp: 18 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2,
        fallSpeed: (0.75 + Math.random() * 0.95) * (0.6 + 0.4 * z),
      };
    };

    for (let i = 0; i < leafCount; i++) {
      leaves.push(initLeaf(null, true));
    }

    // Gust of wind simulation state
    let windGust = 0;
    let targetGust = 0;
    let nextGustTime = Date.now() + 3000 + Math.random() * 4000;

    let lastTime = performance.now();

    const render = (now: number) => {
      if (!isVisible) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = now;

      // Update wind gust cycles
      if (Date.now() > nextGustTime) {
        targetGust = 1.4 + Math.random() * 1.8; // Stronger breeze
        nextGustTime = Date.now() + 6000 + Math.random() * 8000;
      } else {
        targetGust = 0.25 + Math.sin(t * 0.0008) * 0.2; // Gentle baseline breeze
      }
      windGust += (targetGust - windGust) * 0.03;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Sort leaves by depth (z) for correct visual layering
      leaves.sort((a, b) => a.z - b.z);

      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];

        // Physics step
        l.y += l.fallSpeed * 60 * dt;
        l.x += (windGust * (0.8 + 0.4 * l.z) + Math.sin(t * l.swayFreq + l.phase) * (l.swayAmp * 0.04)) * 60 * dt;
        l.rotation += (l.rotSpeed + windGust * 0.004) * 60 * dt;
        l.flip += l.flipSpeed * 60 * dt;

        // Reset if drifted beyond bottom or right edge
        if (l.y > height + l.size * 2 || l.x > width + l.size * 2) {
          leaves[i] = initLeaf(l, false);
          // When blown by wind, spawn mostly from top or left edge
          if (Math.random() < 0.3) {
            leaves[i].x = -l.size * 2;
            leaves[i].y = Math.random() * (height * 0.7);
          }
          continue;
        }

        // 3D flip ratio: cos gives range -1 to 1
        const flipCos = Math.cos(l.flip);
        const scaleX = Math.abs(flipCos);
        const isBack = flipCos < 0;

        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rotation);
        ctx.scale(Math.max(scaleX, 0.08), 1);

        // Alpha based on depth
        ctx.globalAlpha = 0.65 + l.z * 0.32;
        ctx.fillStyle = isBack ? l.darkColor : l.color;
        ctx.strokeStyle = isBack ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.25)";

        // Drop shadow for 3D realism
        ctx.shadowColor = "rgba(40, 25, 20, 0.14)";
        ctx.shadowBlur = 6 * l.z;
        ctx.shadowOffsetX = 2 * l.z;
        ctx.shadowOffsetY = 4 * l.z;

        if (l.type === 0) {
          drawMapleLeaf(ctx, l.size);
        } else if (l.type === 1) {
          drawOakLeaf(ctx, l.size);
        } else {
          drawBirchLeaf(ctx, l.size);
        }

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // IntersectionObserver to pause when off-screen
    const io = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        isVisible = entry?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    io.observe(canvas);

    // Tab visibility handling
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      aria-hidden="true"
      data-testid="autumn-leaves-canvas"
    />
  );
}
