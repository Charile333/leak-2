import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const ParticleWaves: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // 移除 useRef 存储 startTime，改为在 useEffect 内部直接定义，防止闭包陷阱或重渲染问题
  // const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!containerRef.current) return;
    
    // 在 Effect 内部定义 startTime，确保每次挂载都是新的时间基准
    const startTime = Date.now();
    const container = containerRef.current;
    const particleCount = 100000;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      10000
    );
    camera.position.set(0, 300, 600);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const indices = new Float32Array(particleCount);
    
    // 粒子布局 - 网格排列
    const amount = Math.floor(Math.sqrt(particleCount)); 
    const separation = 80; 
    const offset = (amount * separation) / 2;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      const col = i % amount;
      const row = Math.floor(i / amount);
      
      positions[i3] = col * separation - offset;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = row * separation - offset;
      
      sizes[i] = 1.0;
      indices[i] = i;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

    // 定义 Uniforms 对象，确保引用一致
    const customUniforms = {
      uTime: { value: 0.0 },
      uAmplitude: { value: 50.0 },
      uSpeed: { value: 0.25 },
      uParticleSize: { value: 1.0 },
      uAmount: { value: amount } // 将网格大小作为 Uniform 传入
    };

    // Shader Material
    const material = new THREE.ShaderMaterial({
      uniforms: customUniforms,
      vertexShader: `
        uniform float uTime;
        uniform float uAmplitude;
        uniform float uSpeed;
        uniform float uParticleSize;
        uniform float uAmount;
        attribute float size;
        attribute float aIndex;
        
        void main() {
          float instanceIndex = aIndex;
          
          // 使用 Uniform 传入的 grid size
          float x = mod(instanceIndex, uAmount) - uAmount / 2.0;
          float z = floor(instanceIndex / uAmount) - uAmount / 2.0;
          
          // 还原原始的时间计算方式
          float time2 = 1.0 - uTime * 5.0;
          
          float xFactor = x * 0.5;
          float zFactor = z * 0.5;
          
          // 还原原始波浪算法
          float sinX = sin(xFactor + time2 * uSpeed * 5.0 * 0.7) * uAmplitude;
          float sinZ = sin(zFactor + time2 * uSpeed * 5.0 * 0.5) * uAmplitude;
          float y = sinX + sinZ;
          
          vec3 newPosition = vec3(position.x, y, position.z);
          
          // 还原原始粒子大小计算
          float sinSX = (sin(xFactor + time2 * uSpeed * 5.0 * 0.7) + 1.0) * 50.0;
          float sinSZ = (sin(zFactor + time2 * uSpeed * 5.0 * 0.5) + 1.0) * 50.0;
          float particleSize = sinSX + sinSZ;
          
          vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
          gl_PointSize = particleSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        void main() {
          vec2 vUv = gl_PointCoord.xy - vec2(0.5);
          float distance = length(vUv);
          
          if (distance > 0.5) {
            discard;
          }
          
          float alpha = 1.0 - distance * 2.0;
          gl_FragColor = vec4(0.9, 0.4, 1.0, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.05
    });

    // Particles
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    particlesRef.current = particles;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Animation Loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        const elapsedTime = (Date.now() - startTime) * 0.001;
        
        // 直接更新我们持有的 uniforms 对象引用，这是最安全的方式
        customUniforms.uTime.value = elapsedTime;

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate();

    // Resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current) return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }

      if (particlesRef.current) {
        particlesRef.current.geometry.dispose();
        if (Array.isArray(particlesRef.current.material)) {
          particlesRef.current.material.forEach(m => m.dispose());
        } else {
          particlesRef.current.material.dispose();
        }
      }

      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ backgroundColor: 'transparent' }}
    />
  );
};

export default ParticleWaves;