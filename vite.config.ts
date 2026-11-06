import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    viteSingleFile({ outputFileName: 'index.html' }),
    {
      name: 'dev-html-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/dev.html';
          }
          next();
        });
      }
    },
    {
      name: 'copy-standalone-to-root',
      apply: 'build',
      closeBundle() {
        const distIndex = resolve(__dirname, 'dist/index.html');
        const rootIndex = resolve(__dirname, 'index.html');
        if (existsSync(distIndex)) {
          copyFileSync(distIndex, rootIndex);
          console.log('[standalone] Synced dist/index.html -> index.html for GitHub Pages deployment parity');
        }
      }
    }
  ],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: false,
    host: true
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'dev.html')
      }
    }
  }
});
