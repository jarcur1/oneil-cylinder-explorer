import { defineConfig, devices } from "@playwright/test";

const realGpu = process.env.HABITAT_REAL_GPU === "1";

export default defineConfig({
  testDir: "checks",
  testMatch: "*.spec.js",
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4176",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        channel: realGpu ? "chromium" : undefined,
        launchOptions: {
          args: realGpu
            ? []
            : [
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
              ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
  },
});
