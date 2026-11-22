import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/enso/' : '/',
  build: { target: 'es2022' },
  server: { port: 5173 },
});
