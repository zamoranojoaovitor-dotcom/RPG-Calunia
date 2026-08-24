import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
      },
    },
  },
});