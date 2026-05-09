import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // '@' maps to apps/web/src — used by ALL feature pages
      // Eliminates fragile ../../.. relative imports across features/
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@contracts': fileURLToPath(new URL('../../packages/contracts', import.meta.url)),
    },
  },

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-bootstrap': ['bootstrap', 'react-bootstrap'],
          'vendor-axios': ['axios'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setupTests.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['tests/e2e/**'],
  },
});
