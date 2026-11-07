import { defineConfig, type Project } from '@playwright/test';
import { DEVICE_PROFILES, getDeviceProfile } from './config/devices';

const primaryProjects: Project[] = DEVICE_PROFILES.map((profile) => ({
  name: profile.name,
  use: {
    browserName: profile.browser,
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    userAgent: profile.userAgent,
  },
}));

const chromiumDuoProfiles = (['iphone-duo-folded', 'iphone-duo-unfolded'] as const).map(
  (profileName): Project => {
    const profile = getDeviceProfile(profileName);
    return {
      name: `chromium-${profile.name}`,
      use: {
        browserName: 'chromium',
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        userAgent: profile.userAgent,
      },
    };
  },
);

export default defineConfig({
  testDir: './e2e/journeys',
  fullyParallel: true,
  workers: process.env.CI ? undefined : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [...primaryProjects, ...chromiumDuoProfiles],
  webServer: {
    command: 'pnpm run build && pnpm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
