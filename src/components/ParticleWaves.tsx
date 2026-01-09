import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const ParticleWaves: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const particleCount = 8000; // 增加粒子数量，提高视觉效果

    // 初始化场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // 初始化相机
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      10,
      100000
    );
    camera.position.set(0, 300, 800); // 调整相机位置，获得更好的视角
    cameraRef.current = camera;

    // 创建粒子几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    // 初始化粒子位置和大小
    const separation = 80; // 减少粒子间距，使粒子更密集
    const amount = Math.sqrt(particleCount);
    const offset = amount / 2;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const x = (i % amount) - offset;
      const z = Math.floor(i / amount) - offset;

      positions[i3] = x * separation;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = z * separation;
      sizes[i] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // 创建粒子材质 - 更好地复刻tsl-partide-waves效果
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        uColor: { value: new THREE.Color(0x6366f1) }, // 添加主色调，使用紫色调，更接近原效果
      },
      vertexShader: `
        uniform float time;
        
        void main() {
          vec3 pos = position;
          float x = pos.x * 0.02;
          float z = pos.z * 0.02;
          
          // 调整时间参数，使动画更流畅
          float time2 = time * 0.5;
          
          // 波浪运动 - 调整参数，复刻tsl-partide-waves的波浪效果
          float sinX = sin(x + time2) * 150.0; // 调整振幅
          float sinZ = sin(z + time2 * 0.7) * 150.0; // 调整振幅和频率
          
          pos.y = sinX + sinZ;
          
          // 大小变化 - 调整参数，使粒子大小变化更自然
          float sizeMod = sin(x * 2.0 + time2 * 1.2) * 0.5 + 1.0;
          float particleSize = sizeMod * 10.0;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = particleSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        
        void main() {
          // 圆形粒子
          vec2 vUv = gl_PointCoord.xy - vec2(0.5);
          float distance = length(vUv);
          
          if (distance > 0.5) {
            discard;
          }
          
          // 添加渐变效果，更接近原效果
          float alpha = 1.0 - distance * 2.0;
          float alpha2 = pow(alpha, 2.0); // 平方衰减，使中心更亮，边缘更柔和
          
          // 使用主色调，添加亮度变化
          vec3 color = uColor * (alpha2 * 1.2 + 0.3);
          gl_FragColor = vec4(color, alpha2 * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: false,
    });

    // 创建粒子系统
    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    scene.add(particles);
    particlesRef.current = particles;

    // 初始化渲染器
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (error) {
      return;
    }

    // 动画循环
    const animate = () => {
      // 使用requestAnimationFrame确保动画流畅运行
      animationFrameRef.current = requestAnimationFrame(animate);

      // 确保所有引用都存在
      if (!particlesRef.current || !sceneRef.current || !cameraRef.current || !rendererRef.current) {
        return;
      }

      // 更新时间 uniforms - 修复类型错误：添加类型断言
      const currentTime = (Date.now() - (startTimeRef.current || Date.now())) * 0.001;
      const material = particlesRef.current.material as THREE.ShaderMaterial;
      material.uniforms.time.value = currentTime;

      // 渲染场景
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    // 开始动画
    startTimeRef.current = Date.now();
    animate();

    // 窗口大小变化处理
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
        rendererRef.current = null;
      }

      if (particlesRef.current) {
        // 清理几何体
        particlesRef.current.geometry.dispose();
        
        // 清理材质 - 修复类型错误：处理Material | Material[]类型
        const material = particlesRef.current.material;
        if (Array.isArray(material)) {
          // 如果是材质数组，遍历并清理每个材质
          material.forEach(m => m.dispose());
        } else {
          // 如果是单个材质，直接清理
          material.dispose();
        }
        
        particlesRef.current = null;
      }

      window.removeEventListener('resize', handleResize);
      
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ backgroundColor: 'black' }}
    />
  );
};

export default ParticleWaves;