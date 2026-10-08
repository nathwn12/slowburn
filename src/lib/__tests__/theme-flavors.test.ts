import { describe, expect, test, vi } from 'vite-plus/test';

import { averageAccentFromPixels } from '../cover';
import { getTheme, resolveBootThemeId, themes } from '../themes';
import { logAndNotifyError } from '../utils';

vi.mock('../utils', () => ({
  logAndNotifyError: vi.fn<(err: unknown) => void>(),
}));

describe('S1 theme flavors', () => {
  test('gallery scans 4 flavors (__system stays the default outside the map)', () => {
    expect(Object.keys(themes).sort()).toStrictEqual([
      'amoled',
      'dark',
      'dark-warm',
      'light',
    ]);
  });

  test('AMOLED background is pure black', () => {
    expect(themes['amoled']?.variables['--background']).toBe('#000000');
    expect(themes['amoled']?.variables['--bg']).toBe('#000000');
  });

  test('each flavor applies via the getTheme path', () => {
    for (const id of ['light', 'dark', 'dark-warm', 'amoled']) {
      expect(getTheme(id)._id).toBe(id);
    }
  });

  test('invalid id falls back to light with an error', () => {
    expect(getTheme('__nope__')._id).toBe('light');
    expect(logAndNotifyError).toHaveBeenCalledWith(
      'Unknown theme "__nope__", defaulting to "light"',
    );
  });
});

describe('boot theme resolution', () => {
  test('a stored flavor round-trips verbatim, even against a different OS theme', () => {
    expect(resolveBootThemeId('amoled', 'light')).toBe('amoled');
    expect(resolveBootThemeId('dark-warm', 'light')).toBe('dark-warm');
  });

  test('__system resolves to the OS theme', () => {
    expect(resolveBootThemeId('__system', 'dark')).toBe('dark');
    expect(resolveBootThemeId('__system', 'light')).toBe('light');
  });

  test('an unknown stored id falls back safely without throwing', () => {
    expect(resolveBootThemeId('__nope__', 'dark')).toBe('light');
  });
});

describe('art-tint accent sampling', () => {
  test('averages vivid pixels into a hex accent', () => {
    expect(
      averageAccentFromPixels([
        [200, 30, 60],
        [210, 40, 70],
      ]),
    ).toBe('#cd2341');
  });

  test('skips near-grey pixels when vivid ones exist', () => {
    expect(
      averageAccentFromPixels([
        [10, 10, 10],
        [200, 30, 60],
      ]),
    ).toBe('#c81e3c');
  });

  test('empty input yields null (caller restores the persisted accent)', () => {
    expect(averageAccentFromPixels([])).toBeNull();
  });
});
