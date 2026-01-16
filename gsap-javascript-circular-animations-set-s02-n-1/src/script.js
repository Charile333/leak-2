gsap.registerPlugin(CustomEase, Draggable, InertiaPlugin);
CustomEase.create("slideEase", "M0,0 C0.86,0 0.07,1 1,1");

const wrapper = document.querySelector(".wrapper");
const boxes = gsap.utils.toArray(".box");
const animationNames = [
  "3D Sphere Scan",
  "Pulse Wave",
  "Scanning Wave",
  "Interconnecting Wave",
  "Size Pulse Wave",
  "Spiral Pulse Wave",
  "Clockwork Wipe",
  "Line Pulse Wave",
  "Sharp Pulse Wave",
  "Fragmenting Pulse Wave"
];

function animateBackgroundPreloader() {
  const hundredsStrip = document.getElementById("preloader-hundreds");
  const tensStrip = document.getElementById("preloader-tens");
  const onesStrip = document.getElementById("preloader-ones");

  const tl = gsap.timeline({
    repeat: -1,
    repeatDelay: 0.3,
    ease: "power2.inOut"
  });

  const keyframes = [
    { hundreds: 0, tens: 0, ones: 0 },
    { hundreds: 0, tens: 2, ones: 5 },
    { hundreds: 0, tens: 5, ones: 0 },
    { hundreds: 0, tens: 7, ones: 5 },
    { hundreds: 1, tens: 0, ones: 0 },
    { hundreds: 0, tens: 0, ones: 0 }
  ];

  keyframes.forEach((frame, index) => {
    if (index === 0) {
      tl.set([hundredsStrip, tensStrip, onesStrip], { y: 0 });
      tl.to({}, { duration: 0.5 });
    } else {
      const hundredsY = -frame.hundreds * 280;
      const tensY = -frame.tens * 280;
      const onesY = -frame.ones * 280;

      tl.to(
        hundredsStrip,
        {
          y: hundredsY,
          duration: 0.6,
          ease: typeof CustomEase !== "undefined" ? "slideEase" : "power2.inOut"
        },
        index === keyframes.length - 1 ? ">" : ">-0.1"
      );

      tl.to(
        tensStrip,
        {
          y: tensY,
          duration: 0.6,
          ease: typeof CustomEase !== "undefined" ? "slideEase" : "power2.inOut"
        },
        "<+0.05"
      );

      tl.to(
        onesStrip,
        {
          y: onesY,
          duration: 0.6,
          ease: typeof CustomEase !== "undefined" ? "slideEase" : "power2.inOut"
        },
        "<+0.05"
      );

      tl.to({}, { duration: 0.4 });
    }
  });
}

// Theme system - defaults to dark mode
const themeToggle = document.getElementById("themeToggle");
const body = document.body;
const currentTheme = localStorage.getItem("theme") || "dark";

body.setAttribute("data-theme", currentTheme);

themeToggle.addEventListener("click", () => {
  const currentTheme = body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  body.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
});

function updateInfo(element, index) {
  document.getElementById(
    "current-preloader-name"
  ).textContent = animationNames[index].toUpperCase();
  document.getElementById("current-index").textContent = index + 1;
}

function addCornerDecorations() {
  document
    .querySelectorAll(".animation-container")
    .forEach((container, index) => {
      if (index === 0) return;
      ["top-left", "top-right", "bottom-left", "bottom-right"].forEach(
        (position) => {
          const corner = document.createElement("div");
          corner.className = `corner ${position}`;
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );
          svg.setAttribute("width", "16");
          svg.setAttribute("height", "16");
          svg.setAttribute("viewBox", "0 0 512 512");
          const polygon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
          );
          polygon.setAttribute(
            "points",
            "448,224 288,224 288,64 224,64 224,224 64,224 64,288 224,288 224,448 288,448 288,288 448,288"
          );
          polygon.setAttribute("fill", "currentColor");
          svg.appendChild(polygon);
          corner.appendChild(svg);
          container.appendChild(corner);
        }
      );
    });
}

// Utility functions
function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  if (hex.startsWith("#")) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16)
    ];
  }
  const match = hex.match(/\d+/g);
  return match
    ? [
        Number.parseInt(match[0]),
        Number.parseInt(match[1]),
        Number.parseInt(match[2])
      ]
    : [255, 255, 255];
}

function interpolateColor(color1, color2, t, opacity = 1) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getThemeColors() {
  const computedStyle = getComputedStyle(document.body);
  return {
    primary: computedStyle.getPropertyValue("--color-primary").trim(),
    accent: computedStyle.getPropertyValue("--color-accent").trim()
  };
}

function setup3DSphereScan(containerId) {
  const CANVAS_WIDTH = 180;
  const CANVAS_HEIGHT = 180;
  const GLOBAL_SPEED = 1.5;

  const container = document.getElementById(containerId);
  if (!container) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let time = 0;
  let lastTime = 0;

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const radius = CANVAS_WIDTH * 0.4;
  const numDots = 250;
  const dots = [];

  for (let i = 0; i < numDots; i++) {
    const theta = Math.acos(1 - 2 * (i / numDots));
    const phi = Math.sqrt(numDots * Math.PI) * theta;
    dots.push({
      x: radius * Math.sin(theta) * Math.cos(phi),
      y: radius * Math.sin(theta) * Math.sin(phi),
      z: radius * Math.cos(theta)
    });
  }

  function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    time += deltaTime * 0.0005 * GLOBAL_SPEED;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const rotX = Math.sin(time * 0.3) * 0.5;
    const rotY = time * 0.5;
    const easedTime = easeInOutCubic((Math.sin(time * 2.5) + 1) / 2);
    const scanLine = (easedTime * 2 - 1) * radius;
    const scanWidth = 25;
    const colors = getThemeColors();

    dots.forEach((dot) => {
      let { x, y, z } = dot;
      const nX = x * Math.cos(rotY) - z * Math.sin(rotY);
      let nZ = x * Math.sin(rotY) + z * Math.cos(rotY);
      x = nX;
      z = nZ;

      const nY = y * Math.cos(rotX) - z * Math.sin(rotX);
      nZ = y * Math.sin(rotX) + z * Math.cos(rotX);
      y = nY;
      z = nZ;

      const scale = (z + radius * 1.5) / (radius * 2.5);
      const pX = centerX + x;
      const pY = centerY + y;

      const distToScan = Math.abs(y - scanLine);
      const scanInfluence =
        distToScan < scanWidth
          ? Math.cos((distToScan / scanWidth) * (Math.PI / 2))
          : 0;

      const size = Math.max(0, scale * 2.0 + scanInfluence * 2.5);
      const opacity = Math.max(0, scale * 0.6 + scanInfluence * 0.4);

      ctx.beginPath();
      ctx.arc(pX, pY, size, 0, Math.PI * 2);
      if (scanInfluence > 0.3) {
        ctx.fillStyle = colors.accent.startsWith("#")
          ? `${colors.accent}${Math.round(opacity * 255)
              .toString(16)
              .padStart(2, "0")}`
          : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${opacity})`;
      } else {
        const rgb = colors.primary.startsWith("#")
          ? [
              Number.parseInt(colors.primary.slice(1, 3), 16),
              Number.parseInt(colors.primary.slice(3, 5), 16),
              Number.parseInt(colors.primary.slice(5, 7), 16)
            ]
          : colors.primary.match(/\d+/g);
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
      }
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function createPulseWaveAnimation(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 180;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  let time = 0;
  let lastTime = 0;

  const dotRings = [
    { radius: 15, count: 6 },
    { radius: 30, count: 12 },
    { radius: 45, count: 18 },
    { radius: 60, count: 24 },
    { radius: 75, count: 30 }
  ];

  function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    time += deltaTime * 0.001;

    if (options.trail) {
      ctx.fillStyle = `rgba(0, 0, 0, ${options.trail.alpha || 0.1})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const colors = getThemeColors();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    const rgb = colors.primary.startsWith("#")
      ? [
          Number.parseInt(colors.primary.slice(1, 3), 16),
          Number.parseInt(colors.primary.slice(3, 5), 16),
          Number.parseInt(colors.primary.slice(5, 7), 16)
        ]
      : colors.primary.match(/\d+/g);
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`;
    ctx.fill();

    dotRings.forEach((ring, ringIndex) => {
      options.logic(
        ctx,
        ring,
        ringIndex,
        time,
        centerX,
        centerY,
        dotRings,
        colors
      );
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function setupAllAnimations() {
  setup3DSphereScan("animation-0");

  createPulseWaveAnimation("animation-1", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const pulseTime = time * 2 - ringIndex * 0.4;
        const radiusPulse =
          easeInOutSine((Math.sin(pulseTime) + 1) / 2) * 6 - 3;
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
          colors.primary,
          colors.accent,
          colorBlend,
          opacityBase
        );
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-2", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      const scanHeight = 80;
      const scanSpeed = 1.5;
      const scanPhase = (Math.sin(time * scanSpeed) + 1) / 2;
      const scanY =
        centerY +
        (easeInOutSine(scanPhase) * 2 - 1) * (centerY + scanHeight / 2);

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
            colors.primary,
            colors.accent,
            colorBlend,
            opacity
          );
          ctx.fill();
        }
      }
    }
  });

  createPulseWaveAnimation("animation-3", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      if (ringIndex >= dotRings.length - 1) return;

      const nextRing = dotRings[ringIndex + 1];
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const radiusPulse1 = Math.sin(time * 2 - ringIndex * 0.4) * 3;
        const x1 = centerX + Math.cos(angle) * (ring.radius + radiusPulse1);
        const y1 = centerY + Math.sin(angle) * (ring.radius + radiusPulse1);

        const nextRingRatio = nextRing.count / ring.count;
        for (let j = 0; j < nextRingRatio; j++) {
          const nextAngle =
            ((i * nextRingRatio + j) / nextRing.count) * Math.PI * 2;
          const radiusPulse2 = Math.sin(time * 2 - (ringIndex + 1) * 0.4) * 3;
          const x2 =
            centerX + Math.cos(nextAngle) * (nextRing.radius + radiusPulse2);
          const y2 =
            centerY + Math.sin(nextAngle) * (nextRing.radius + radiusPulse2);

          const lineOpacity =
            0.1 +
            ((Math.sin(time * 3 - ringIndex * 0.5 + i * 0.3) + 1) / 2) * 0.4;
          const isActive = Math.sin(time * 3 - ringIndex * 0.5 + i * 0.3) > 0.6;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineWidth = 1;

          if (isActive) {
            ctx.strokeStyle = colors.accent.startsWith("#")
              ? `${colors.accent}${Math.round(lineOpacity * 255)
                  .toString(16)
                  .padStart(2, "0")}`
              : `rgba(${colors.accent
                  .match(/\d+/g)
                  .join(",")}, ${lineOpacity})`;
          } else {
            const rgb = colors.primary.startsWith("#")
              ? [
                  Number.parseInt(colors.primary.slice(1, 3), 16),
                  Number.parseInt(colors.primary.slice(3, 5), 16),
                  Number.parseInt(colors.primary.slice(5, 7), 16)
                ]
              : colors.primary.match(/\d+/g);
            ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${lineOpacity})`;
          }
          ctx.stroke();
        }

        const dotOpacity =
          0.4 + Math.sin(time * 2 - ringIndex * 0.4 + i * 0.2) * 0.6;
        const isHighlighted =
          Math.sin(time * 2 - ringIndex * 0.4 + i * 0.2) > 0.7;

        ctx.beginPath();
        ctx.arc(x1, y1, 1.5, 0, Math.PI * 2);
        if (isHighlighted) {
          ctx.fillStyle = colors.accent.startsWith("#")
            ? `${colors.accent}${Math.round(dotOpacity * 255)
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${dotOpacity})`;
        } else {
          const rgb = colors.primary.startsWith("#")
            ? [
                Number.parseInt(colors.primary.slice(1, 3), 16),
                Number.parseInt(colors.primary.slice(3, 5), 16),
                Number.parseInt(colors.primary.slice(5, 7), 16)
              ]
            : colors.primary.match(/\d+/g);
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dotOpacity})`;
        }
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-4", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * ring.radius;
        const y = centerY + Math.sin(angle) * ring.radius;

        const pulseTime = time * 2 - ringIndex * 0.4;
        const sizePhase = (Math.sin(pulseTime) + 1) / 2;
        const sizePulse = 1 + easeInOutCubic(sizePhase) * 3;
        const opacityPhase = (Math.sin(pulseTime + i * 0.2) + 1) / 2;
        const opacityWave = 0.2 + easeInOutSine(opacityPhase) * 0.8;
        const pulseIntensity = smoothstep(1.5, 3.5, sizePulse);

        ctx.beginPath();
        ctx.arc(x, y, sizePulse, 0, Math.PI * 2);
        const colorBlend = smoothstep(0.2, 0.8, pulseIntensity);
        ctx.fillStyle = interpolateColor(
          colors.primary,
          colors.accent,
          colorBlend,
          opacityWave
        );
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-5", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      const rotationSpeed = 0.5 - ringIndex * 0.08;
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + time * rotationSpeed;
        const radiusPulse = Math.sin(time * 2 - ringIndex * 0.4) * 3;
        const x = centerX + Math.cos(angle) * (ring.radius + radiusPulse);
        const y = centerY + Math.sin(angle) * (ring.radius + radiusPulse);

        const opacityWave = 0.4 + Math.sin(time * 2 - ringIndex * 0.4) * 0.6;
        const isLeading = angle % (Math.PI * 2) < Math.PI / 4;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        if (isLeading) {
          ctx.fillStyle = colors.accent.startsWith("#")
            ? `${colors.accent}${Math.round(opacityWave * 255)
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${opacityWave})`;
        } else {
          const rgb = colors.primary.startsWith("#")
            ? [
                Number.parseInt(colors.primary.slice(1, 3), 16),
                Number.parseInt(colors.primary.slice(3, 5), 16),
                Number.parseInt(colors.primary.slice(5, 7), 16)
              ]
            : colors.primary.match(/\d+/g);
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityWave})`;
        }
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-6", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      const wipeSpeed = 1.5;
      const fadeLength = Math.PI / 1.5;
      const wipeAngle = (time * wipeSpeed + ringIndex * 0.5) % (Math.PI * 2);

      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        let angleDiff = (angle - wipeAngle) % (Math.PI * 2);
        if (angleDiff < 0) angleDiff += Math.PI * 2;

        let opacity = 0;
        if (angleDiff < fadeLength) {
          opacity = Math.pow(1 - angleDiff / fadeLength, 2);
        }

        if (opacity > 0.01) {
          const size = 1.5 + opacity * 2;
          const radiusOffset = opacity * 5;
          const x = centerX + Math.cos(angle) * (ring.radius + radiusOffset);
          const y = centerY + Math.sin(angle) * (ring.radius + radiusOffset);
          const isWipeFront = angleDiff < fadeLength / 3;

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          if (isWipeFront) {
            ctx.fillStyle = colors.accent.startsWith("#")
              ? `${colors.accent}${Math.round(opacity * 0.9 * 255)
                  .toString(16)
                  .padStart(2, "0")}`
              : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${
                  opacity * 0.9
                })`;
          } else {
            const rgb = colors.primary.startsWith("#")
              ? [
                  Number.parseInt(colors.primary.slice(1, 3), 16),
                  Number.parseInt(colors.primary.slice(3, 5), 16),
                  Number.parseInt(colors.primary.slice(5, 7), 16)
                ]
              : colors.primary.match(/\d+/g);
            ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${
              opacity * 0.9
            })`;
          }
          ctx.fill();
        }
      }
    }
  });

  createPulseWaveAnimation("animation-7", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const radiusPulse = Math.sin(time * 2 - ringIndex * 0.4) * 3;
        const x = centerX + Math.cos(angle) * (ring.radius + radiusPulse);
        const y = centerY + Math.sin(angle) * (ring.radius + radiusPulse);

        const opacityWave =
          0.4 + Math.sin(time * 2 - ringIndex * 0.4 + i * 0.2) * 0.6;
        const isActive = Math.sin(time * 2 - ringIndex * 0.4 + i * 0.2) > 0.6;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.lineWidth = 0.5;

        if (isActive) {
          ctx.strokeStyle = colors.accent.startsWith("#")
            ? `${colors.accent}${Math.round(opacityWave * 0.7 * 255)
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${
                opacityWave * 0.7
              })`;
        } else {
          const rgb = colors.primary.startsWith("#")
            ? [
                Number.parseInt(colors.primary.slice(1, 3), 16),
                Number.parseInt(colors.primary.slice(3, 5), 16),
                Number.parseInt(colors.primary.slice(5, 7), 16)
              ]
            : colors.primary.match(/\d+/g);
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${
            opacityWave * 0.5
          })`;
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        if (isActive) {
          ctx.fillStyle = colors.accent.startsWith("#")
            ? `${colors.accent}${Math.round(opacityWave * 255)
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${opacityWave})`;
        } else {
          const rgb = colors.primary.startsWith("#")
            ? [
                Number.parseInt(colors.primary.slice(1, 3), 16),
                Number.parseInt(colors.primary.slice(3, 5), 16),
                Number.parseInt(colors.primary.slice(5, 7), 16)
              ]
            : colors.primary.match(/\d+/g);
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityWave})`;
        }
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-8", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
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
          ctx.fillStyle = colors.accent.startsWith("#")
            ? `${colors.accent}${Math.round(opacityWave * 255)
                .toString(16)
                .padStart(2, "0")}`
            : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${opacityWave})`;
        } else {
          const rgb = colors.primary.startsWith("#")
            ? [
                Number.parseInt(colors.primary.slice(1, 3), 16),
                Number.parseInt(colors.primary.slice(3, 5), 16),
                Number.parseInt(colors.primary.slice(5, 7), 16)
              ]
            : colors.primary.match(/\d+/g);
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacityWave})`;
        }
        ctx.fill();
      }
    }
  });

  createPulseWaveAnimation("animation-9", {
    logic: (ctx, ring, ringIndex, time, centerX, centerY, dotRings, colors) => {
      const speed = 0.4;
      const pulsePhase = (time * speed - ringIndex * 0.08) % 1;
      const currentRadius = ring.radius + pulsePhase * 25;

      if (currentRadius > ring.radius + 1) {
        const opacity = 1 - Math.pow(pulsePhase, 2);
        const dotSize = 2.5 * (1 - pulsePhase);
        const isExpanding = pulsePhase < 0.3;

        for (let i = 0; i < ring.count; i++) {
          const angle = (i / ring.count) * Math.PI * 2;
          const x = centerX + Math.cos(angle) * currentRadius;
          const y = centerY + Math.sin(angle) * currentRadius;

          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          if (isExpanding) {
            ctx.fillStyle = colors.accent.startsWith("#")
              ? `${colors.accent}${Math.round(opacity * 255)
                  .toString(16)
                  .padStart(2, "0")}`
              : `rgba(${colors.accent.match(/\d+/g).join(",")}, ${opacity})`;
          } else {
            const rgb = colors.primary.startsWith("#")
              ? [
                  Number.parseInt(colors.primary.slice(1, 3), 16),
                  Number.parseInt(colors.primary.slice(3, 5), 16),
                  Number.parseInt(colors.primary.slice(5, 7), 16)
                ]
              : colors.primary.match(/\d+/g);
            ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
          }
          ctx.fill();
        }
      }
    }
  });
}

let activeElement;
const loop = horizontalLoop(boxes, {
  paused: true,
  draggable: true,
  center: true,
  onChange: (element, index) => {
    activeElement && activeElement.classList.remove("active");
    element.classList.add("active");
    activeElement = element;
    updateInfo(element, index);
  }
});

setTimeout(() => {
  loop.toIndex(0, { duration: 0 });
}, 100);

boxes.forEach((box, i) =>
  box.addEventListener("click", () =>
    loop.toIndex(i, { duration: 0.8, ease: "power1.inOut" })
  )
);

document
  .querySelector(".toggle")
  .addEventListener("click", () => wrapper.classList.toggle("show-overflow"));

document
  .querySelector(".next")
  .addEventListener("click", () =>
    loop.next({ duration: 0.4, ease: "power1.inOut" })
  );

document
  .querySelector(".prev")
  .addEventListener("click", () =>
    loop.previous({ duration: 0.4, ease: "power1.inOut" })
  );

function horizontalLoop(items, config) {
  let timeline;
  items = gsap.utils.toArray(items);
  config = config || {};
  gsap.context(() => {
    let onChange = config.onChange,
      lastIndex = 0,
      tl = gsap.timeline({
        repeat: config.repeat,
        onUpdate:
          onChange &&
          (() => {
            const i = tl.closestIndex();
            if (lastIndex !== i) {
              lastIndex = i;
              onChange(items[i], i);
            }
          }),
        paused: config.paused,
        defaults: { ease: "none" },
        onReverseComplete: () =>
          tl.totalTime(tl.rawTime() + tl.duration() * 100)
      }),
      length = items.length,
      startX = items[0].offsetLeft,
      times = [],
      widths = [],
      spaceBefore = [],
      xPercents = [],
      curIndex = 0,
      indexIsDirty = false,
      center = config.center,
      pixelsPerSecond = (config.speed || 1) * 100,
      snap =
        config.snap === false ? (v) => v : gsap.utils.snap(config.snap || 1),
      timeOffset = 0,
      container =
        center === true
          ? items[0].parentNode
          : gsap.utils.toArray(center)[0] || items[0].parentNode,
      totalWidth,
      getTotalWidth = () =>
        items[length - 1].offsetLeft +
        (xPercents[length - 1] / 100) * widths[length - 1] -
        startX +
        spaceBefore[0] +
        items[length - 1].offsetWidth *
          gsap.getProperty(items[length - 1], "scaleX") +
        (Number.parseFloat(config.paddingRight) || 0),
      populateWidths = () => {
        let b1 = container.getBoundingClientRect(),
          b2;
        items.forEach((el, i) => {
          widths[i] = Number.parseFloat(gsap.getProperty(el, "width", "px"));
          xPercents[i] = snap(
            (Number.parseFloat(gsap.getProperty(el, "x", "px")) / widths[i]) *
              100 +
              gsap.getProperty(el, "xPercent")
          );
          b2 = el.getBoundingClientRect();
          spaceBefore[i] = b2.left - (i ? b1.right : b1.left);
          b1 = b2;
        });
        gsap.set(items, { xPercent: (i) => xPercents[i] });
        totalWidth = getTotalWidth();
      },
      timeWrap,
      populateOffsets = () => {
        timeOffset = center
          ? (tl.duration() * (container.offsetWidth / 2)) / totalWidth
          : 0;
        center &&
          times.forEach((t, i) => {
            times[i] = timeWrap(
              tl.labels["label" + i] +
                (tl.duration() * widths[i]) / 2 / totalWidth -
                timeOffset
            );
          });
      },
      getClosest = (values, value, wrap) => {
        let i = values.length,
          closest = 1e10,
          index = 0,
          d;
        while (i--) {
          d = Math.abs(values[i] - value);
          if (d > wrap / 2) {
            d = wrap - d;
          }
          if (d < closest) {
            closest = d;
            index = i;
          }
        }
        return index;
      },
      populateTimeline = () => {
        let i, item, curX, distanceToStart, distanceToLoop;
        tl.clear();
        for (i = 0; i < length; i++) {
          item = items[i];
          curX = (xPercents[i] / 100) * widths[i];
          distanceToStart = item.offsetLeft + curX - startX + spaceBefore[0];
          distanceToLoop =
            distanceToStart + widths[i] * gsap.getProperty(item, "scaleX");
          tl.to(
            item,
            {
              xPercent: snap(((curX - distanceToLoop) / widths[i]) * 100),
              duration: distanceToLoop / pixelsPerSecond
            },
            0
          )
            .fromTo(
              item,
              {
                xPercent: snap(
                  ((curX - distanceToLoop + totalWidth) / widths[i]) * 100
                )
              },
              {
                xPercent: xPercents[i],
                duration:
                  (curX - distanceToLoop + totalWidth - curX) / pixelsPerSecond,
                immediateRender: false
              },
              distanceToLoop / pixelsPerSecond
            )
            .add("label" + i, distanceToStart / pixelsPerSecond);
          times[i] = distanceToStart / pixelsPerSecond;
        }
        timeWrap = gsap.utils.wrap(0, tl.duration());
      },
      refresh = (deep) => {
        const progress = tl.progress();
        tl.progress(0, true);
        populateWidths();
        deep && populateTimeline();
        populateOffsets();
        deep && tl.draggable && tl.paused()
          ? tl.time(times[curIndex], true)
          : tl.progress(progress, true);
      },
      onResize = () => refresh(true),
      proxy;
    gsap.set(items, { x: 0 });
    populateWidths();
    populateTimeline();
    populateOffsets();
    window.addEventListener("resize", onResize);
    function toIndex(index, vars) {
      vars = vars || {};
      Math.abs(index - curIndex) > length / 2 &&
        (index += index > curIndex ? -length : length);
      let newIndex = gsap.utils.wrap(0, length, index),
        time = times[newIndex];
      if (time > tl.time() !== index > curIndex && index !== curIndex) {
        time += tl.duration() * (index > curIndex ? 1 : -1);
      }
      if (time < 0 || time > tl.duration()) {
        vars.modifiers = { time: timeWrap };
      }
      curIndex = newIndex;
      vars.overwrite = true;
      gsap.killTweensOf(proxy);
      return vars.duration === 0
        ? tl.time(timeWrap(time))
        : tl.tweenTo(time, vars);
    }
    tl.toIndex = (index, vars) => toIndex(index, vars);
    tl.closestIndex = (setCurrent) => {
      const index = getClosest(times, tl.time(), tl.duration());
      if (setCurrent) {
        curIndex = index;
        indexIsDirty = false;
      }
      return index;
    };
    tl.current = () => (indexIsDirty ? tl.closestIndex(true) : curIndex);
    tl.next = (vars) => toIndex(tl.current() + 1, vars);
    tl.previous = (vars) => toIndex(tl.current() - 1, vars);
    tl.times = times;
    tl.progress(1, true).progress(0, true);
    if (config.reversed) {
      tl.vars.onReverseComplete();
      tl.reverse();
    }
    if (config.draggable && typeof Draggable === "function") {
      proxy = document.createElement("div");
      let wrap = gsap.utils.wrap(0, 1),
        ratio,
        startProgress,
        draggable,
        dragSnap,
        lastSnap,
        initChangeX,
        wasPlaying,
        align = () =>
          tl.progress(
            wrap(startProgress + (draggable.startX - draggable.x) * ratio)
          ),
        syncIndex = () => tl.closestIndex(true);
      typeof InertiaPlugin === "undefined" &&
        console.warn(
          "InertiaPlugin required for momentum-based scrolling and snapping. https://greensock.com/club"
        );
      draggable = Draggable.create(proxy, {
        trigger: items[0].parentNode,
        type: "x",
        onPressInit() {
          const x = this.x;
          gsap.killTweensOf(tl);
          wasPlaying = !tl.paused();
          tl.pause();
          startProgress = tl.progress();
          refresh();
          ratio = 1 / totalWidth;
          initChangeX = startProgress / -ratio - x;
          gsap.set(proxy, { x: startProgress / -ratio });
        },
        onDrag: align,
        onThrowUpdate: align,
        overshootTolerance: 0,
        inertia: true,
        snap(value) {
          if (Math.abs(startProgress / -ratio - this.x) < 10) {
            return lastSnap + initChangeX;
          }
          let time = -(value * ratio) * tl.duration(),
            wrappedTime = timeWrap(time),
            snapTime = times[getClosest(times, wrappedTime, tl.duration())],
            dif = snapTime - wrappedTime;
          Math.abs(dif) > tl.duration() / 2 &&
            (dif += dif < 0 ? tl.duration() : -tl.duration());
          lastSnap = (time + dif) / tl.duration() / -ratio;
          return lastSnap;
        },
        onRelease() {
          syncIndex();
          draggable.isThrowing && (indexIsDirty = true);
        },
        onThrowComplete: () => {
          syncIndex();
          wasPlaying && tl.play();
        }
      })[0];
      tl.draggable = draggable;
    }
    tl.closestIndex(true);
    lastIndex = curIndex;
    onChange && onChange(items[curIndex], curIndex);
    timeline = tl;
    return () => window.removeEventListener("resize", onResize);
  });
  return timeline;
}

window.addEventListener("load", () => {
  addCornerDecorations();
  setupAllAnimations();
  setTimeout(() => {
    animateBackgroundPreloader();
  }, 100);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight")
      loop.next({ duration: 0.4, ease: "power1.inOut" });
    if (e.key === "ArrowLeft")
      loop.previous({ duration: 0.4, ease: "power1.inOut" });
  });
});
