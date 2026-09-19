import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws by design outside a Server Component. Stub it so
      // the real server modules stay unit-testable.
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
