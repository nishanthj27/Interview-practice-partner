import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    server: {
        port: 5173,
    },
    build: {
        rollupOptions: {
            input: {
                index: path.resolve(currentDirectory, 'index.html'),
                auth: path.resolve(currentDirectory, 'auth.html'),
                chat: path.resolve(currentDirectory, 'chat.html'),
                voice: path.resolve(currentDirectory, 'voice.html'),
                dashboard: path.resolve(currentDirectory, 'dashboard.html'),
            },
        },
    },
});
