import { describe, expect, test } from 'vite-plus/test';

import { shouldShowCustomTitleBar } from '../title-bar';

describe('shouldShowCustomTitleBar', () => {
  test('windows draws the custom frameless bar', () => {
    expect(shouldShowCustomTitleBar('windows')).toBe(true);
  });

  test('macos keeps the overlay traffic lights', () => {
    expect(shouldShowCustomTitleBar('macos')).toBe(false);
  });

  test('linux keeps the native frame', () => {
    expect(shouldShowCustomTitleBar('linux')).toBe(false);
  });

  test('mobile platforms keep the native chrome', () => {
    expect(shouldShowCustomTitleBar('ios')).toBe(false);
    expect(shouldShowCustomTitleBar('android')).toBe(false);
  });
});
