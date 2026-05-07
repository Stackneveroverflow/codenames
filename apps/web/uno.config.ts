import { defineConfig, presetAttributify, presetWind3 } from "unocss";

export default defineConfig({
  content: {
    filesystem: ["index.html", "src/**/*.{ts,tsx,css}"],
  },
  presets: [presetAttributify(), presetWind3()],
  shortcuts: {
    "uno-glass-panel": "backdrop-blur-md border border-amber-200/20 shadow-xl",
    "uno-retro-chip": "inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold",
    "uno-touch-target": "min-h-11 touch-manipulation select-none",
  },
});
