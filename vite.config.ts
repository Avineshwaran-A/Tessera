import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production CSP for the desktop build (loaded from file://). Dev keeps Vite's inline HMR preamble working.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'";

export default defineConfig(({ command }) => ({
  base: './', // relative asset URLs so dist/index.html works from file:// inside Electron
  plugins: [react(), {
    name: 'tessera-csp',
    transformIndexHtml: html => command === 'build' ? html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`) : html,
  }],
}));
