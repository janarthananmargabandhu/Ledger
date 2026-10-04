import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// All files live in one folder so they can be uploaded to GitHub in one drag. Relative paths work on GitHub Pages.
export default defineConfig({ base: './', publicDir: false, plugins: [react()] });
