import { defineConfig } from "vitest/config";
import path from "path";

// Minimal config so tests can exercise server modules: resolve the "@/" path
// alias (from tsconfig) and stub "server-only" (a no-op outside RSC). Does not
// change test environment or behavior for existing relative-import tests.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      "@": path.resolve(__dirname),
    },
  },
});
