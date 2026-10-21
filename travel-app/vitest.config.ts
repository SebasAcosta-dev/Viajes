import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/app\//, replacement: fileURLToPath(new URL("./src/app/", import.meta.url)) },
      { find: /^@\/features\//, replacement: fileURLToPath(new URL("./src/features/", import.meta.url)) },
      { find: /^@\/lib\//, replacement: fileURLToPath(new URL("./src/lib/", import.meta.url)) },
      { find: /^@\/components\//, replacement: fileURLToPath(new URL("./src/components/", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
