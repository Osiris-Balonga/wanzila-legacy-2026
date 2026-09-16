import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
