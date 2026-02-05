import React, { useEffect, useRef } from 'react';

interface AdvancedBackgroundProps {
  className?: string;
}

export const AdvancedBackground: React.FC<AdvancedBackgroundProps> = ({ className = '' }) => {
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

    // 网格数据
    const gridSize = 50;
    const gridLines: {
      x: number;
      y: number;
      width: number;
      height: number;
      opacity: number;
      speed: number;
    }[] = [];

    // 初始化网格
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

    // 光效数据
    const lightEffects = [
      {
        x: canvas.width * 0.2,
        y: canvas.height * 0.2,
        radius: 100,
        opacity: 0.1,
        speed: 0.3,
        direction: 1
      },
      {
        x: canvas.width * 0.8,
        y: canvas.height * 0.8,
        radius: 150,
        opacity: 0.08,
        speed: 0.2,
        direction: -1
      },
      {
        x: canvas.width * 0.5,
        y: canvas.height * 0.5,
        radius: 200,
        opacity: 0.06,
        speed: 0.1,
        direction: 1
      }
    ];

    // 几何形状数据
    const shapes = [
      {
        type: 'circle',
        x: canvas.width * 0.1,
        y: canvas.height * 0.1,
        radius: 30,
        opacity: 0.05,
        speedX: 0.2,
        speedY: 0.1
      },
      {
        type: 'triangle',
        x: canvas.width * 0.9,
        y: canvas.height * 0.1,
        size: 40,
        opacity: 0.05,
        speedX: -0.1,
        speedY: 0.15
      },
      {
        type: 'square',
        x: canvas.width * 0.1,
        y: canvas.height * 0.9,
        size: 35,
        opacity: 0.05,
        speedX: 0.15,
        speedY: -0.1
      },
      {
        type: 'circle',
        x: canvas.width * 0.9,
        y: canvas.height * 0.9,
        radius: 25,
        opacity: 0.05,
        speedX: -0.1,
        speedY: -0.05
      }
    ];

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制网格
      gridLines.forEach(line => {
        ctx.beginPath();
        if (line.width > line.height) {
          // 水平线
          ctx.moveTo(line.x, line.y);
          ctx.lineTo(line.x + line.width, line.y);
        } else {
          // 垂直线
          ctx.moveTo(line.x, line.y);
          ctx.lineTo(line.x, line.y + line.height);
        }
        ctx.lineWidth = line.width > line.height ? line.height : line.width;
        ctx.strokeStyle = `rgba(0, 149, 217, ${line.opacity})`;
        ctx.stroke();

        // 更新网格位置
        if (line.width > line.height) {
          // 水平线
          line.y += line.speed;
          if (line.y < -line.height || line.y > canvas.height) {
            line.y = 0;
          }
        } else {
          // 垂直线
          line.x += line.speed;
          if (line.x < -line.width || line.x > canvas.width) {
            line.x = 0;
          }
        }
      });

      // 绘制光效
      lightEffects.forEach(light => {
        ctx.beginPath();
        ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
        gradient.addColorStop(0, `rgba(0, 149, 217, ${light.opacity})`);
        gradient.addColorStop(1, 'rgba(0, 149, 217, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // 更新光效位置
        light.x += light.speed * light.direction;
        light.y += light.speed * light.direction;

        // 边界检查
        if (light.x < 0 || light.x > canvas.width || light.y < 0 || light.y > canvas.height) {
          light.direction *= -1;
        }
      });

      // 绘制几何形状
      shapes.forEach(shape => {
        ctx.beginPath();
        if (shape.type === 'circle') {
          ctx.arc(shape.x, shape.y, shape.radius || 0, 0, Math.PI * 2);
        } else if (shape.type === 'triangle') {
          const size = shape.size || 0;
          ctx.moveTo(shape.x, shape.y - size / 2);
          ctx.lineTo(shape.x + size / 2, shape.y + size / 2);
          ctx.lineTo(shape.x - size / 2, shape.y + size / 2);
          ctx.closePath();
        } else if (shape.type === 'square') {
          const size = shape.size || 0;
          ctx.rect(shape.x - size / 2, shape.y - size / 2, size, size);
        }
        ctx.fillStyle = `rgba(0, 149, 217, ${shape.opacity})`;
        ctx.fill();

        // 更新形状位置
        shape.x += shape.speedX;
        shape.y += shape.speedY;

        // 边界检查
        if (shape.x < 0 || shape.x > canvas.width) {
          shape.speedX *= -1;
        }
        if (shape.y < 0 || shape.y > canvas.height) {
          shape.speedY *= -1;
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
