import React, { useEffect, useRef } from 'react';

// --- Utility Functions ---

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith("#")) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }
  return [255, 255, 255];
}

function interpolateColor(color1: string, color2: string, t: number, opacity: number = 1): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// --- Configuration ---

const COLORS = {
  primary: "#ffffff",
  accent: "#8A2BE2"
};

const DOT_RINGS = [
  { radius: 15, count: 6 },
  { radius: 30, count: 12 },
  { radius: 45, count: 18 },
  { radius: 60, count: 24 },
  { radius: 75, count: 30 }
];

// --- Base Component ---

interface AnimationProps {
  className?: string;
}

const BaseCanvas: React.FC<AnimationProps & { logic: (ctx: CanvasRenderingContext2D, time: number, centerX: number, centerY: number) => void }> = ({ className, logic }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (matches the container in the original design roughly, but scaled for high DPI)
    // Original was 180x180. We'll make it responsive but keep aspect ratio square-ish or fit container.
    // Let's stick to a fixed internal resolution for consistency and scale with CSS.
    canvas.width = 360; // 2x for retina
    canvas.height = 360;
    
    let animationFrameId: number;
    let startTime: number | null = null;

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const time = (timestamp - startTime) * 0.001;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Scale context to fit logic (original logic assumed 180x180 center at 90,90)
      // We are 360x360, so center is 180,180. Logic can use 180,180 directly or we scale.
      // Let's pass center 180,180 and double the radii in logic or just use scale.
      // Easiest is to scale the context so logic coordinates (approx 0-180) work.
      ctx.save();
      ctx.scale(2, 2); 
      const centerX = 90;
      const centerY = 90;

      // Draw center dot
      ctx.beginPath();
      ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
      const rgb = hexToRgb(COLORS.primary);
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`;
      ctx.fill();

      logic(ctx, time, centerX, centerY);

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render(performance.now());

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [logic]);

  return <canvas ref={canvasRef} className={`w-full h-full ${className}`} />;
};

// --- Specific Animations ---

export const PulseWaveCanvas: React.FC<AnimationProps> = (props) => {
  const logic = (ctx: CanvasRenderingContext2D, time: number, centerX: number, centerY: number) => {
    DOT_RINGS.forEach((ring, ringIndex) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const pulseTime = time * 2 - ringIndex * 0.4;
        const radiusPulse = easeInOutSine((Math.sin(pulseTime) + 1) / 2) * 6 - 3;
        const x = centerX + Math.cos(angle) * (ring.radius + radiusPulse);
        const y = centerY + Math.sin(angle) * (ring.radius + radiusPulse);

        const opacityPhase = (Math.sin(pulseTime + i * 0.2) + 1) / 2;
        const opacityBase = 0.3 + easeInOutSine(opacityPhase) * 0.7;
        const highlightPhase = (Math.sin(pulseTime) + 1) / 2;
        const highlightIntensity = easeInOutCubic(highlightPhase);

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        const colorBlend = smoothstep(0.2, 0.8, highlightIntensity);
        ctx.fillStyle = interpolateColor(
          COLORS.primary,
          COLORS.accent,
          colorBlend,
          opacityBase
        );
        ctx.fill();
      }
    });
  };

  return <BaseCanvas {...props} logic={logic} />;
};

export const ScanningWaveCanvas: React.FC<AnimationProps> = (props) => {
  const logic = (ctx: CanvasRenderingContext2D, time: number, centerX: number, centerY: number) => {
    const scanHeight = 80;
    const scanSpeed = 1.5;
    const scanPhase = (Math.sin(time * scanSpeed) + 1) / 2;
    const scanY = centerY + (easeInOutSine(scanPhase) * 2 - 1) * (centerY + scanHeight / 2);

    DOT_RINGS.forEach((ring, ringIndex) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * ring.radius;
        const y = centerY + Math.sin(angle) * ring.radius;

        const distFromScan = Math.abs(y - scanY);
        let opacity = 0;
        if (distFromScan < scanHeight / 2) {
          const normalizedDist = distFromScan / (scanHeight / 2);
          opacity = easeInOutCubic(1 - normalizedDist);
        }

        const size = 1 + easeInOutSine(opacity) * 1.5;
        if (opacity > 0.01) {
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          const colorBlend = smoothstep(0.2, 0.8, opacity);
          ctx.fillStyle = interpolateColor(
            COLORS.primary,
            COLORS.accent,
            colorBlend,
            opacity
          );
          ctx.fill();
        }
      }
    });
  };

  return <BaseCanvas {...props} logic={logic} />;
};

export const SharpPulseCanvas: React.FC<AnimationProps> = (props) => {
  const logic = (ctx: CanvasRenderingContext2D, time: number, centerX: number, centerY: number) => {
    DOT_RINGS.forEach((ring, ringIndex) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const phase = time * 2 - ringIndex * 0.4;
        const sharpSin = Math.pow(Math.sin(phase), 4);
        const radiusPulse = sharpSin * 6 - 2;
        const x = centerX + Math.cos(angle) * (ring.radius + radiusPulse);
        const y = centerY + Math.sin(angle) * (ring.radius + radiusPulse);

        const opacityWave = 0.2 + Math.pow(Math.sin(phase + i * 0.2), 4) * 0.8;
        const isPeak = sharpSin > 0.8;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        if (isPeak) {
           // Accent color
           const rgb = hexToRgb(COLORS.accent);
           ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityWave})`;
        } else {
           // Primary color
           const rgb = hexToRgb(COLORS.primary);
           ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityWave})`;
        }
        ctx.fill();
      }
    });
  };

  return <BaseCanvas {...props} logic={logic} />;
};
