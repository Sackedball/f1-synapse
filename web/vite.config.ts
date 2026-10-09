import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

function fixturesMiddleware() {
  return {
    name: 'serve-fixtures',
    configureServer(server: any) {
      server.middlewares.use('/fixtures', (req: any, res: any, next: any) => {
        const cleanUrl = (req.url || '').split('?')[0].replace(/^\/+/, '');
        const filePath = path.resolve(__dirname, 'fixtures', decodeURIComponent(cleanUrl));
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          if (ext === '.bin') {
            res.setHeader('Content-Type', 'application/octet-stream');
          } else if (ext === '.json') {
            res.setHeader('Content-Type', 'application/json');
          }
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      // Copy fixtures to dist/fixtures during build
      const srcDir = path.join(__dirname, 'fixtures');
      const distDir = path.join(__dirname, 'dist', 'fixtures');
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, distDir, { recursive: true });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), fixturesMiddleware()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pixi.js')) {
            return 'vendor-pixi';
          }
          if (id.includes('node_modules/uplot')) {
            return 'vendor-uplot';
          }
          if (id.includes('node_modules/dockview-react')) {
            return 'vendor-dockview';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
