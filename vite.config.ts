import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// `npm run demo` swaps the Firebase backend for an in-memory one (src/backend.demo.ts) to check the UI locally.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: mode === 'demo'
    ? { alias: [{ find: /^\.\/backend$/, replacement: fileURLToPath(new URL('./src/backend.demo.ts', import.meta.url)) }] }
    : {},
}));
