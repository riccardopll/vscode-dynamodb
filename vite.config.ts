import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist/webview",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/webview/main.ts"),
      name: "DynamoDbExplorerWebview",
      formats: ["iife"],
      fileName: () => "app.js",
      cssFileName: "app",
    },
  },
});
