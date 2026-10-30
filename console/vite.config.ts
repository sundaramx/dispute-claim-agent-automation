/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Local-only LLM gateway bridge (backend/src/dca/api/dev_llm.py, TD-60).
  server: { proxy: { "/api/dev/llm": "http://127.0.0.1:8001" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
