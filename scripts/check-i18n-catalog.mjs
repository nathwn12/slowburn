#!/usr/bin/env node
/**
 * Release guard: fail the build when a compiled message id in `dist` is absent
 * from the source-locale catalog.
 *
 * Why: in production the macro strips the descriptor's `message` and ships
 * `{id}` only, so a catalog miss renders the raw id (a short hash). Dev and the
 * whole test suite keep the message and render fine - so a stale catalog is
 * invisible until someone runs the built app. This asserts it at build time.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ASSETS = 'dist/assets';
const files = readdirSync(ASSETS).filter((name) => name.endsWith('.js'));
const enFile = files.find((name) => /^en-.*\.js$/.test(name));

if (enFile == null) {
  console.error(`[i18n] no en-*.js catalog in ${ASSETS} - run \`pnpm build\` first`);
  process.exit(1);
}

// Import the emitted chunk and read its `messages` export (the compiled
// catalog); no fragile parsing of the embedded JSON.
const enModule = await import(pathToFileURL(join(ASSETS, enFile)).href);
const catalog = new Set(Object.keys(enModule.messages ?? {}));

// The compiled macro form is `{id:`...`}` (backticks after minification, quotes
// otherwise). Route objects also carry `id:` but their ids are paths, so only
// catalog-shaped ids (base64url, no `/` or `$`) are treated as message ids.
const ID_RE = /\{id:\s*(?:`([^`]+)`|"([^"]+)")/g;
const CATALOG_ID_RE = /^[A-Za-z0-9_-]{4,12}$/;
const missing = new Set();
for (const file of files) {
  const code = readFileSync(join(ASSETS, file), 'utf8');
  for (const match of code.matchAll(ID_RE)) {
    const id = match[1] ?? match[2];
    if (!CATALOG_ID_RE.test(id)) continue;
    if (!catalog.has(id)) missing.add(id);
  }
}

if (missing.size > 0) {
  console.error(
    `[i18n] ${missing.size} message id(s) missing from ${enFile}. ` +
      'Run `pnpm run gen:translations` and rebuild.',
  );
  for (const id of [...missing].slice(0, 20)) console.error(`  ${id}`);
  process.exit(1);
}

console.log(`[i18n] all message ids resolve against ${enFile} (${catalog.size} entries)`);
