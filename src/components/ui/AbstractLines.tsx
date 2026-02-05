import React, { useEffect, useRef } from 'react';

interface AbstractLinesProps {
  className?: string;
}

export const AbstractLines: React.FC<AbstractLinesProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawLines();
    };

    const drawLines = () => {
      if (!ctx || !canvas) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const lineCount = 15;
      const lineSpacing = canvas.height / (lineCount + 1);

      for (let i = 1; i <= lineCount; i++) {
        const y = lineSpacing * i;
        const amplitude = 60;
        const frequency = 0.003;
        const opacity = Math.random() * 0.15 + 0.05;

        ctx.beginPath();
        ctx.moveTo(0, y);

        for (let x = 0; x < canvas.width; x++) {
          const offset = Math.sin(x * frequency + i) * amplitude;
          ctx.lineTo(x, y + offset);
        }

        ctx.strokeStyle = `rgba(0, 149, 217, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 初始绘制
    drawLines();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed top-0 left-0 right-0 bottom-0 pointer-events-none z-[-1] ${className}`}
      style={{ opacity: 0.8 }}
    />
  );
};
