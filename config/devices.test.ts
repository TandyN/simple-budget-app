import { describe, expect, test } from 'vitest';
import { DEVICE_PROFILES, getDeviceProfile } from './devices';

describe('device profiles', () => {
  test('the device profiles include the iPhone Duo folded and unfolded screens', () => {
    const foldedScreen = getDeviceProfile('iphone-duo-folded');
    const unfoldedScreen = getDeviceProfile('iphone-duo-unfolded');

    expect(foldedScreen.viewport).toEqual({ width: 466, height: 678 });
    expect(foldedScreen.deviceScaleFactor).toBe(3);
    expect(foldedScreen.browser).toBe('webkit');

    expect(unfoldedScreen.viewport).toEqual({ width: 626, height: 890 });
    expect(unfoldedScreen.deviceScaleFactor).toBe(3);
    expect(unfoldedScreen.browser).toBe('webkit');
  });

  test('every device profile is a touch-enabled mobile viewport', () => {
    for (const profile of DEVICE_PROFILES) {
      expect(profile.isMobile).toBe(true);
      expect(profile.hasTouch).toBe(true);
      expect(profile.viewport.width).toBeGreaterThan(0);
      expect(profile.viewport.height).toBeGreaterThan(0);
    }
  });
});
