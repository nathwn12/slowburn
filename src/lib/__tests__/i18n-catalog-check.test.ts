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
  /** raw en.po content; when set, no en chunk is written (inlined catalog). */
  enPo?: string;
  /** the emitted bundle containing the descriptors. */
  bundle?: string;
  /** when false, no en chunk is written. */
  writeEn?: boolean;
  /** when false, no dist/assets exists at all. */
  writeAssets?: boolean;
};

function makeFixture(fixture: Fixture): string {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  // The real build output lives under the project root, whose package.json is
  // `"type": "module"`, so the guard's `import()` loads the emitted en chunk as
  // ESM. Mirror that here: without a package.json the temp dir defaults to
  // CommonJS and the chunk's `export` fails to parse.
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const en = fixture.en ?? { [ID]: ['Slowburn'] };
  const writeEn = fixture.enPo == null && (fixture.writeEn ?? true);
  const writeAssets = fixture.writeAssets ?? true;

  mkdirSync(join(dir, 'src', 'translations'), { recursive: true });
  writeFileSync(join(dir, 'src', 'translations', 'en.po'), fixture.enPo ?? '');
  if (writeAssets) {
    mkdirSync(join(dir, 'dist', 'assets'), { recursive: true });
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
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixture(options: Fixture = {}): string {
  const dir = makeFixture(options);
  dirs.push(dir);
  return dir;
}

describe('check-i18n-catalog', () => {
  test('passes when every referenced id resolves against the en catalog', () => {
    const result = run(fixture());
    expect(result.status).toBe(0);
    expect(result.out).toContain('resolve against the en catalog');
  });

  test('passes when a non-descriptor preset object sits beside a real descriptor', () => {
    const result = run(
      fixture({
        bundle: `x({id:"presetAlbum",labelKey:"Artist / Album",keys:[]}); x({id:"${ID}",message:"Slowburn"});`,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.out).toContain('resolve against');
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

  test('fails when the en catalog chunk is empty', () => {
    const result = run(fixture({ en: {} }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('is empty');
  });

  test('fails when the en catalog chunk is missing', () => {
    const result = run(fixture({ writeEn: false }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('no compiled en catalog chunk');
  });

  test('passes when the catalog is inlined (no chunk) and ids resolve via en.po', () => {
    // "Slowburn" hashes to PG2LIB via generateMessageId.
    const result = run(
      fixture({
        enPo: 'msgid "Slowburn"\nmsgstr "Slowburn"\n',
        bundle: `x({id:"PG2LIB",message:"Slowburn"});`,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.out).toContain('inlined in main chunk');
  });

  test('fails loudly when there is no build output at all', () => {
    const result = run(fixture({ writeAssets: false }));
    expect(result.status).toBe(1);
    expect(result.out).toContain('no build output');
  });
});
