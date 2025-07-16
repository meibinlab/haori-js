import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "Haori",
      fileName: (format) => format === "es" ? "haori.js" : `haori.${format}.js`,
      formats: ["es", "iife"]
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    sourcemap: true
  },
  test: {
    environment: "jsdom"
  }
});
