import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// Two pages: index.html runs on the glasses, scan.html on the phone. GitHub Pages serves /docs.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: {input: {index: 'index.html', scan: 'scan.html'}},
  },
});
