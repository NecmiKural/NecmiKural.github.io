import { defineConfig, devices } from "@playwright/test";

// Tests the built site (npm run build first). The HTML page in Chromium, Firefox and WebKit;
// 3D mode in Chromium with WebGL rendered in software, so it runs the same on CI machines without
// a GPU. (Software rendering cannot capture the tall full-page screenshots, hence two projects.)
const html = /site\.spec\.ts/;
export default defineConfig({
  testDir: "tests",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", testMatch: html, use: devices["Desktop Chrome"] },
    { name: "firefox", testMatch: html, use: devices["Desktop Firefox"] },
    { name: "webkit", testMatch: html, use: devices["Desktop Safari"] },
    {
      name: "3d",
      testMatch: /deck\.spec\.ts/,
      // Software rendering is slow: a heavy scene's frames take about 0.3 s each, so a 1.6 s load
      // can take over 4 s to finish. Timing claims are checked by their own assertions.
      timeout: 60_000,
      expect: { timeout: 10_000 },
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
});
