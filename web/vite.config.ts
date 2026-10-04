import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false
  }
});
