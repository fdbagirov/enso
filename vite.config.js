import { defineConfig } from 'vite';

const pages = process.env.GITHUB_PAGES === 'true';
export default defineConfig({
  base: pages ? '/enso/' : '/',
  plugins: [{
    name: 'pages-dynamic-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!pages || !id.includes('/src/') || !id.endsWith('.js')) return null;
      return code.replace(/(["'`])\/(img|video|fonts)\//g, '$1/enso/$2/');
    },
  }],
  build: { target: 'es2022', cssMinify: false },
  server: { port: 5173 },
});
