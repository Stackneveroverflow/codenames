import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "../web/public",
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});
