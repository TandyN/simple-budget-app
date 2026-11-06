export interface DeviceProfile {
  readonly name: 'iphone-duo-folded' | 'iphone-duo-unfolded' | 'iphone-17' | 'pixel-android';
  readonly label: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  readonly userAgent: string;
  readonly browser: 'webkit' | 'chromium';
}

const IPHONE_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';

const PIXEL_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';

export const DEVICE_PROFILES: readonly DeviceProfile[] = [
  {
    name: 'iphone-duo-folded',
    label: 'iPhone Duo (Folded cover screen)',
    viewport: { width: 466, height: 678 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_SAFARI_USER_AGENT,
    browser: 'webkit',
  },
  {
    name: 'iphone-duo-unfolded',
    label: 'iPhone Duo (Unfolded inner screen)',
    viewport: { width: 626, height: 890 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_SAFARI_USER_AGENT,
    browser: 'webkit',
  },
  {
    name: 'iphone-17',
    label: 'iPhone 17',
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_SAFARI_USER_AGENT,
    browser: 'webkit',
  },
  {
    name: 'pixel-android',
    label: 'Pixel Android',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: PIXEL_CHROME_USER_AGENT,
    browser: 'chromium',
  },
];

export function getDeviceProfile(name: DeviceProfile['name']): DeviceProfile {
  const profile = DEVICE_PROFILES.find((candidate) => candidate.name === name);
  if (!profile) {
    throw new Error(`Unknown device profile: ${name}`);
  }
  return profile;
}
