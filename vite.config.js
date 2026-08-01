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
    minify: 'esbuild'
  },
  server: {
    port: 5173,
    open: false
  },
  // Proxy Netlify functions in local dev if needed
  // For full AI, deploy to Netlify or set GEMINI_API_KEY and run functions separately
});
