import { defineConfig } from "@playwright/test";
import path from "node:path";

const backend = path.resolve(__dirname, "../backend");
const python = process.env.TEST_PYTHON ?? path.join(backend, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
export default defineConfig({
  testDir: "./tests",
  timeout: 300_000,
  expect: { timeout: 120_000 },
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3011", channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true, actionTimeout: 20_000, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: [
    { command: `"${python}" -m tests.run_e2e_server`, cwd: backend, url: "http://127.0.0.1:8011/health", timeout: 60_000 },
    { command: "npm run dev -- --port 3011", url: "http://127.0.0.1:3011", timeout: 90_000,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8011", NEXT_DIST_DIR: ".next-e2e" } },
  ],
});
