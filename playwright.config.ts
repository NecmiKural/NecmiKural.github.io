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
      // Software rendering is slow, and a scene's load animation can take 2 s; leave room.
      timeout: 60_000,
      expect: { timeout: 10_000 },
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
});
