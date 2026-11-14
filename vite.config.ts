import { defineConfig } from "vite";

// GitHub Pages serves the site from /cat-lab/, while the dev server stays at the root
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/cat-lab/" : "/",
}));
