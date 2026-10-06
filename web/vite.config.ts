import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { manifestInlinePlugin } from "./src/manifest/inlineManifest.ts";

export default defineConfig({
  base: "./",
  plugins: [react(), manifestInlinePlugin()],
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false
  }
});
