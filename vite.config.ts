import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';

// A version stamp: baked into the pages and written to version.json, so an old cached page can
// tell it's out of date and reload itself.
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');
const version: Plugin = {
  name: 'version',
  generateBundle() {
    this.emitFile({type: 'asset', fileName: 'version.json', source: JSON.stringify({build: BUILD})});
  },
};

// Two pages: index.html runs on the glasses, scan.html on the phone. GitHub Pages serves /docs.
export default defineConfig({
  base: './',
  plugins: [react(), version],
  define: {__BUILD__: JSON.stringify(BUILD)},
  build: {
    target: 'es2022',
    outDir: 'docs',
    emptyOutDir: true,
    rollupOptions: {input: {index: 'index.html', scan: 'scan.html'}},
  },
});
