import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O painel fica em web/ e é gerado em dist/, que o servidor Express entrega.
// `npm run dev:web` abre o Vite com recarga automática e repassa /api ao agendador.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:7400' } },
});
