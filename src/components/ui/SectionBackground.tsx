import React, { useEffect, useRef } from 'react';

interface SectionBackgroundProps {
  className?: string;
  zIndex?: number;
}

export const SectionBackground: React.FC<SectionBackgroundProps> = ({ 
  className = '',
  zIndex = -1
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 粒子数据
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.1
    }));

    // 网格数据
    const gridSize = 50;
    const gridLines = [];
    for (let x = 0; x <= canvas.width; x += gridSize) {
      gridLines.push({
        x,
        y: 0,
        width: 1,
        height: canvas.height,
        opacity: Math.random() * 0.1 + 0.02,
        speed: (Math.random() - 0.5) * 0.2
      });
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
      gridLines.push({
        x: 0,
        y,
        width: canvas.width,
        height: 1,
        opacity: Math.random() * 0.1 + 0.02,
        speed: (Math.random() - 0.5) * 0.2
      });
    }

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制粒子
      particles.forEach(particle => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 149, 217, ${particle.opacity})`;
        ctx.fill();
        particle.x += particle.speedX;
        particle.y += particle.speedY;
        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <>
      {/* 噪点纹理 */}
      <div 
        className={`absolute inset-0 ${className}`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
          zIndex: zIndex,
          width: '100vw',
          height: '100vh'
        }}
      />
      
      {/* 动态效果 */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 pointer-events-none ${className}`}
        style={{ 
          opacity: 0.8,
          zIndex: zIndex,
          width: '100vw',
          height: '100vh'
        }}
      />
    </>
  );
};
