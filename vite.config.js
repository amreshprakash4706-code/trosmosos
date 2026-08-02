import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    open: false,
    headers: {
      'X-Content-Type-Options': 'nosniff'
    }
  },
  preview: {
    port: 4173
  }
});
