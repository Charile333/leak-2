import React, { useEffect, useRef } from 'react';

interface SphereScanProps {
  className?: string;
}

const SphereScan: React.FC<SphereScanProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration
    const GLOBAL_SPEED = 0.5;
    const MONOCHROME_FILL = (opacity: number) =>
      `rgba(0, 149, 217, ${Math.max(0, Math.min(1, opacity))})`; // Using #0095D9

    let animationFrameId: number;
    let time = 0;
    let lastTime = 0;

    // Set canvas size
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Easing function
    function easeInOutCubic(t: number) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Animation setup
    const numDots = 450; // Increased for larger display
    const dots: { x: number; y: number; z: number }[] = [];
    
    // Initialize dots on first render
    const initDots = () => {
      const radius = Math.min(canvas.width, canvas.height) * 0.35;
      dots.length = 0;
      for (let i = 0; i < numDots; i++) {
        const theta = Math.acos(1 - 2 * (i / numDots));
        const phi = Math.sqrt(numDots * Math.PI) * theta;
        dots.push({
          x: radius * Math.sin(theta) * Math.cos(phi),
          y: radius * Math.sin(theta) * Math.sin(phi),
          z: radius * Math.cos(theta)
        });
      }
    };

    initDots();
    // Re-init dots when resize happens to adjust radius
    window.addEventListener('resize', initDots);

    function animate(timestamp: number) {
      if (!canvas || !ctx) return;
      
      if (!lastTime) lastTime = timestamp;
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;
      time += deltaTime * 0.0005 * GLOBAL_SPEED;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(canvas.width, canvas.height) * 0.35;

      const rotX = Math.sin(time * 0.3) * 0.5;
      const rotY = time * 0.5;
      const easedTime = easeInOutCubic((Math.sin(time * 2.5) + 1) / 2);
      const scanLine = (easedTime * 2 - 1) * radius;
      const scanWidth = radius * 0.2;

      dots.forEach((dot) => {
        let { x, y, z } = dot;
        
        // Rotate Y
        let nX = x * Math.cos(rotY) - z * Math.sin(rotY);
        let nZ = x * Math.sin(rotY) + z * Math.cos(rotY);
        x = nX;
        z = nZ;
        
        // Rotate X
        let nY = y * Math.cos(rotX) - z * Math.sin(rotX);
        nZ = y * Math.sin(rotX) + z * Math.cos(rotX);
        y = nY;
        z = nZ;

        const scale = (z + radius * 1.5) / (radius * 2.5);
        const pX = centerX + x;
        const pY = centerY + y;
        
        const distToScan = Math.abs(y - scanLine);
        let scanInfluence =
          distToScan < scanWidth
            ? Math.cos((distToScan / scanWidth) * (Math.PI / 2))
            : 0;
            
        const size = Math.max(0, scale * 2.0 + scanInfluence * 3.5);
        const opacity = Math.max(0, scale * 0.4 + scanInfluence * 0.6);

        ctx.beginPath();
        ctx.arc(pX, pY, size, 0, Math.PI * 2);
        ctx.fillStyle = MONOCHROME_FILL(opacity);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    }

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('resize', initDots);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
      />
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent/50 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent/50 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent/50 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent/50 rounded-br-lg" />
    </div>
  );
};

export default SphereScan;
