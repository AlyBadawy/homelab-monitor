var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        // In dev, proxy /api to the backend container/service.
        proxy: {
            '/api': {
                target: (_a = process.env.VITE_API_PROXY) !== null && _a !== void 0 ? _a : 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
});
