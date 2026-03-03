import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                v1: resolve(__dirname, 'v1.html'),
                v2: resolve(__dirname, 'v2.html'),
            },
        },
    },
});
