import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
  plugins: [
    react(),
    // NOTE: @replit/vite-plugin-cartographer is intentionally omitted.
    // Its beacon script registers a capturing document click-listener that
    // intercepts every click before React handlers fire, making the preview
    // completely unresponsive. The dev-banner is also omitted because it only
    // displays when NOT inside an iframe — i.e. never in the Replit preview.
    // Both plugins are safe to leave out; they are developer-ergonomics tools
    // and have zero effect on production builds or app behaviour.
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    // host + allowedHosts are both required for Replit's reverse-proxy preview.
    // host: "0.0.0.0" makes the dev server bind on all interfaces so the proxy
    // can reach it. allowedHosts: true lets any Host header through the Vite
    // middleware check (the proxy sends the public *.replit.dev hostname).
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
});
