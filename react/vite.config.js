import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the React app into ../assets/js/neustgle.js (loaded by index.php).
// The styles live in ../assets/css/style.css, so no CSS is bundled here.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '../assets/js',
    emptyOutDir: false,
    lib: {
      entry: 'src/main.jsx',
      name: 'Neustgle',
      formats: ['iife'],
      fileName: () => 'neustgle.js',
    },
  },
});
