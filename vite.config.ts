import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// `npm run build`        -> dist/        static site + PWA (install / offline)
// `npm run build:single` -> dist-single/ one self-contained index.html (double-click to open)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    // The single-file build must not depend on files next to it.
    publicDir: single ? false : 'public',
    plugins: [
      react(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'Finanças',
              short_name: 'Finanças',
              description: 'Controle financeiro pessoal, 100% no seu navegador.',
              lang: 'pt-BR',
              start_url: './',
              display: 'standalone',
              background_color: '#ffffff',
              theme_color: '#0c8599',
              icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
            },
          }),
    ],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      // ~1.4 MB (≈460 KB gzip), mostly ECharts. Fine for a local-first app that loads once and runs offline.
      chunkSizeWarningLimit: 1600,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
