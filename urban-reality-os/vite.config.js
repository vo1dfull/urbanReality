import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ fastRefresh: true })],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { protocol: 'ws', host: 'localhost', port: 5173 },
    middlewareMode: false
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre': ['maplibre-gl'],
          'vendor': ['react', 'react-dom'],
          'ui': ['framer-motion', 'recharts']
        }
      }
    },
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false,
    cssCodeSplit: true
  },
  optimize: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
});
