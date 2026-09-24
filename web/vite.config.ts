import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('katex')) return 'katex';
            return 'vendor';
          }
          for (const year of ['2025', '2024', '2023', '2022', '2021', '2020', '2019']) {
            if (id.includes(`ssc-chsl-${year}`)) return `ssc-chsl-${year}`;
            if (id.includes(`gate-${year}`)) return `gate-${year}`;
          }
        },
      },
    },
  },
});
