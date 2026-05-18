import { defineConfig } from "vite";

export default defineConfig({
  base: "/entry/",
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
});
