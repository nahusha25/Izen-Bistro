import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// Dev (`vite`): served at / on :5173, proxying /api to the Frappe bench.
// Build (`vite build`): emits into the Frappe app's public/ folder, which
// Frappe serves at /assets/kamra/frontend/. The served SPA mounts at /kamra
// (see the router basename in main.tsx and website_route_rules in hooks.py).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/assets/izensphere_stay_and_dine/frontend/" : "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../izensphere_stay_and_dine/public/frontend",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // React and the router change far less often than app code: a
        // separate chunk stays cached in browsers across releases.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)\//.test(id))
            return "vendor"
        },
      },
    },
  },
  server: {
    port: Number(process.env.DEV_PORT) || 5173,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:8000",
        headers: { Host: "stayanddine.localhost" },
      },
    },
  },
}))
