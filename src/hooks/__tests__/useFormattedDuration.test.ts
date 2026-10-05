import { describe, expect, test } from 'vite-plus/test';

import { parseDuration } from '../useFormattedDuration';

describe('parseDuration', () => {
  test('should return a duration as a human-friendly string', () => {
    expect(parseDuration(0)).toStrictEqual('0:00');
    expect(parseDuration(1)).toStrictEqual('0:01');
    expect(parseDuration(10)).toStrictEqual('0:10');
    expect(parseDuration(60)).toStrictEqual('1:00');
    expect(parseDuration(695)).toStrictEqual('11:35');
    expect(parseDuration(7261)).toStrictEqual('2:01:01');
    expect(parseDuration(9_999_999)).toStrictEqual('2777:46:39');
  });
});
