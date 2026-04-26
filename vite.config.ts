import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Pyth Sui SDK imports `node:buffer`; alias to the npm `buffer`
  // polyfill so the bundle works in browsers.
  resolve: {
    alias: {
      "node:buffer": "buffer",
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Pyth Sui SDK depends on @mysten/sui — keep them together to
          // avoid a circular vendor-pyth ↔ vendor-sui chunk warning.
          if (id.includes("@mysten/") || id.includes("@pythnetwork/")) {
            return "vendor-sui";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router")
          ) {
            return "vendor-react";
          }
          if (id.includes("@tanstack/")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: false,
  },
});
