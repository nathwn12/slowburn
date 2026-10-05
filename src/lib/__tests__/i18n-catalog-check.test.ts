/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vite-plus/test';

const SCRIPT = join(process.cwd(), 'scripts', 'check-i18n-catalog.mjs');

const ID = 'AAAAAA';
const OTHER_ID = 'ZZZZZZ';

type Fixture = {
  /** en catalog messages keyed by id. */
  en?: Record<string, unknown>;
  /** extra locale -> messages (defaults to a copy of en). */
  locales?: Record<string, Record<string, unknown>>;
  /** the emitted bundle containing the descriptors. */
  bundle?: string;
  /** when false, no en chunk is written. */
  writeEn?: boolean;
  /** when false, no dist/assets exists at all. */
  writeAssets?: boolean;
};

function makeFixture(fixture: Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  const en = fixture.en ?? { [ID]: ['Slowburn'] };
  const locales: Record<string, Record<string, unknown>> = {
    es: en,
    ...(fixture.locales ?? {}),
  };
  const writeEn = fixture.writeEn ?? true;
  const writeAssets = fixture.writeAssets ?? true;

  mkdirSync(join(dir, 'src', 'translations'), { recursive: true });
  writeFileSync(join(dir, 'src', 'translations', 'en.po'), '');
  for (const locale of Object.keys(locales)) {
    writeFileSync(join(dir, 'src', 'translations', `${locale}.po`), '');
  }
  if (writeAssets) {
    mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
    for (const locale of Object.keys(locales)) {
      writeFileSync(
        join(dir, 'dist', 'assets', `${locale}-abcdef.js`),
        `export const messages = ${JSON.stringify(locales[locale])};`,
      );
    }
    if (writeEn) {
      writeFileSync(
        join(dir, 'dist', 'assets', `en-abcdef.js`),
        `export const messages = ${JSON.stringify(en)};`,
      );
    }
    writeFileSync(
      join(dir, 'dist', 'assets', 'index-abcdef.js'),
      fixture.bundle ?? `i18n._({id:"${ID}"});`,
    );
  }
  return dir;
}

function run(dir: string): { status: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
    });
    return { status: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(options: Fixture = {}): string {
  const dir = makeFixture(options);
  dirs.push(dir);
  return dir;
}

describe('check-i18n-catalog', () => {
  test('passes when every referenced id resolves and locales agree', () => {
    const result = run(fixture());
    expect(result.status).toBe(0);
    expect(result.out).toContain('resolve across 2 catalogs');
  });

  test('passes when a non-descriptor preset object sits beside a real descriptor', () => {
    const result = run(
      fixture({
        bundle: `x({id:"presetAlbum",labelKey:"Artist / Album",keys:[]}); x({id:"${ID}",message:"Slowburn"});`,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.out).toContain('resolve across');
  });

  test('fails on a missing id', () => {
    const result = run(fixture({ bundle: `x({id:"${OTHER_ID}"});` }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('missing from the en catalog');
  });

  test('fails when the descriptor shape drifts (zero ids scanned)', () => {
    // Space after `{`: the old regex would match nothing and pass silently.
    const result = run(fixture({ bundle: `x({ id: "${ID}" });` }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('scanned 0 message ids');
  });

  test('fails when a locale catalog does not match en', () => {
    const result = run(
      fixture({ locales: { es: { [OTHER_ID]: ['x'] } } }),
    );
    expect(result.status).toBe(1);
    expect(result.out).toContain('does not match en');
  });

  test('fails when a locale catalog chunk is missing', () => {
    const result = run(fixture({ writeEn: false }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('no compiled en catalog chunk');
  });

  test('fails loudly when there is no build output at all', () => {
    const result = run(fixture({ writeAssets: false }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('no build output');
  });
});
