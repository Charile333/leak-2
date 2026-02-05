import React, { useEffect, useRef } from 'react';

interface EnhancedBackgroundProps {
  className?: string;
}

export const EnhancedBackground: React.FC<EnhancedBackgroundProps> = ({ className = '' }) => {
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
    const particles: {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      color: string;
    }[] = [];

    const particleCount = 50;

    // 初始化粒子
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: '#0095D9'
      });
    }

    // 光带数据
    const lightBands = [
      { x: 0, y: canvas.height * 0.3, width: canvas.width, height: 1, opacity: 0.1, speed: 0.5 },
      { x: 0, y: canvas.height * 0.6, width: canvas.width, height: 1, opacity: 0.08, speed: 0.3 },
      { x: 0, y: canvas.height * 0.9, width: canvas.width, height: 1, opacity: 0.06, speed: 0.2 }
    ];

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制粒子
      particles.forEach(particle => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 149, 217, ${particle.opacity})`;
        ctx.fill();

        // 更新粒子位置
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // 边界检查
        if (particle.x < 0 || particle.x > canvas.width) {
          particle.speedX *= -1;
        }
        if (particle.y < 0 || particle.y > canvas.height) {
          particle.speedY *= -1;
        }
      });

      // 绘制光带
      lightBands.forEach(band => {
        ctx.beginPath();
        ctx.moveTo(band.x, band.y);
        ctx.lineTo(band.x + band.width, band.y);
        ctx.lineWidth = band.height;
        ctx.strokeStyle = `rgba(0, 149, 217, ${band.opacity})`;
        ctx.stroke();

        // 更新光带位置
        band.x -= band.speed;
        if (band.x < -band.width) {
          band.x = 0;
        }
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
    <canvas
      ref={canvasRef}
      className={`fixed top-0 left-0 right-0 bottom-0 pointer-events-none z-0 ${className}`}
      style={{ opacity: 0.8 }}
    />
  );
};
