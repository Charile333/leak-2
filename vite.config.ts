import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const manualChunks = (id: string) => {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    id.includes('node_modules/react/') ||
    id.includes('node_modules/react-dom/') ||
    id.includes('node_modules/react-router') ||
    id.includes('node_modules/scheduler/')
  ) {
    return 'react-vendor';
  }

  if (id.includes('node_modules/framer-motion/')) {
    return 'motion-vendor';
  }

  if (
    id.includes('node_modules/three/') ||
    id.includes('node_modules/@react-three/') ||
    id.includes('node_modules/ogl/') ||
    id.includes('node_modules/p5/') ||
    id.includes('node_modules/react-p5/')
  ) {
    return 'graphics-vendor';
  }

  if (id.includes('node_modules/recharts/')) {
    return 'charts-vendor';
  }

  return 'vendor';
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    assetsInclude: ['**/*.glb'],
    plugins: [react(), tailwindcss()],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    server: {
      proxy: {
        '/api/trend': {
          target: env.VITE_TRENDRADAR_API_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/trend/, '/api'),
          configure: (proxy) => {
            proxy.on('proxyReq', (_proxyReq, req) => {
              const target = env.VITE_TRENDRADAR_API_URL;
              console.log(
                `[Trend Proxy] ${req.method} ${req.url} -> ${target}${req.url?.replace('/api/trend', '/api')}`,
              );
            });
          },
        },
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          timeout: 20000,
          configure: (proxy) => {
            proxy.on('proxyReq', (_proxyReq, req) => {
              const target = env.VITE_BACKEND_URL || 'http://localhost:3001';
              console.log(`[Vite Proxy] ${req.method} ${req.url} -> ${target}${req.url}`);
            });

            proxy.on('error', (err, req, res) => {
              console.error(`[Vite Proxy Error] ${req.method} ${req.url}: ${err.message}`);

              if ('writeHead' in res) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    error: 'Proxy Error',
                    message: '\u4ee3\u7406\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u72b6\u6001\u540e\u91cd\u8bd5\u3002',
                    details: err.message,
                  }),
                );
              }
            });

            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[Vite Proxy Response] ${req.method} ${req.url} <- ${proxyRes.statusCode}`);
            });
          },
        },
      },
    },
  };
});
