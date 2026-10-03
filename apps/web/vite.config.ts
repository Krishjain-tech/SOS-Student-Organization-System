import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ root: 'apps/web', plugins: [react(), tailwindcss()], server: { port: 5173, strictPort: true, host: '127.0.0.1', watch: process.env.NODE_ENV === 'test' ? null : undefined, hmr: process.env.NODE_ENV === 'test' ? false : undefined, proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001' } }, build: { outDir: 'dist' } });
