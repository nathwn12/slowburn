#!/usr/bin/env node
/**
 * Release guard: fail the build when any compiled message id in `dist` is
 * absent from the catalogs, or when a shipped locale catalog is missing/empty.
 *
 * Why: in production the macro strips the descriptor's `message` and ships
 * `{id}` only, so a catalog miss renders the raw id (a short hash). Dev and the
 * whole test suite keep the message and render fine - so a stale catalog is
 * invisible until someone runs the built app.
 *
 * The check is deliberately fail-loud: it exits 1 when it cannot find the
 * catalogs, when a locale chunk is missing/empty, or when it scanned zero ids
 * (which is what a descriptor-shape change would look like).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ASSETS = 'dist/assets';
const LOCALES_DIR = 'src/translations';

function fail(message) {
  console.error(`[i18n] ${message}`);
  process.exit(1);
}

const locales = readdirSync(LOCALES_DIR)
  .filter((name) => name.endsWith('.po'))
  .map((name) => name.slice(0, -3))
  .sort();

if (!locales.includes('en')) {
  fail('no en.po in ' + LOCALES_DIR);
}

const files = (() => {
  try {
    return readdirSync(ASSETS)
      .filter((name) => name.endsWith('.js'))
      .sort();
  } catch {
    return fail(`no build output at ${ASSETS} - run \`pnpm run build\` first`);
  }
})();

// Resolve each locale's compiled chunk by prefix rather than a hard-coded name.
// The Lingui/Vite build emits the catalog for `src/translations/<locale>.po` as
// `<locale>-<hash>.js`; a locale whose chunk cannot be found fails the build
// loudly instead of being skipped.
async function loadCatalog(locale) {
  const file = files.find(
    (name) => name.startsWith(`${locale}-`) && name.endsWith('.js'),
  );
  if (file == null) {
    fail(`no compiled ${locale} catalog chunk in ${ASSETS}`);
  }
  const module = await import(pathToFileURL(join(ASSETS, file)).href);
  const keys = Object.keys(module.messages ?? {});
  if (keys.length === 0) {
    fail(`${locale} catalog ${file} is empty`);
  }
  return { file, keys: new Set(keys) };
}

let enCatalog = null;
for (const locale of locales) {
  const { file, keys } = await loadCatalog(locale);
  if (locale === 'en') {
    enCatalog = keys;
    console.log(`[i18n] en catalog ${file}: ${keys.size} entries`);
    continue;
  }
  if (keys.size !== enCatalog.size || [...enCatalog].some((id) => !keys.has(id))) {
    fail(
      `${locale} catalog ${file} does not match en (${keys.size} vs ${enCatalog.size} entries)`,
    );
  }
}

// The compiled macro form is `{id:`...`}` (backticks after minification, quotes
// otherwise). Route objects also carry `id:` but their ids are paths, so only
// catalog-shaped ids (base64url, no `/` or `$`) are treated as message ids.
const ID_RE = /\{id:\s*(?:`([^`]+)`|"([^"]+)")/g;
const CATALOG_ID_RE = /^[A-Za-z0-9_-]{4,12}$/;
const scanned = new Set();
const missing = new Set();
for (const file of files) {
  const code = readFileSync(join(ASSETS, file), 'utf8');
  for (const match of code.matchAll(ID_RE)) {
    const id = match[1] ?? match[2];
    if (!CATALOG_ID_RE.test(id)) continue;
    scanned.add(id);
    if (!enCatalog.has(id)) missing.add(id);
  }
}

// A zero-id scan means the descriptor shape changed and this guard can no
// longer see the build; that must fail, not pass silently.
if (scanned.size === 0) {
  fail(
    'scanned 0 message ids - the compiled descriptor shape changed; update ID_RE',
  );
}

if (missing.size > 0) {
  fail(
    `${missing.size} message id(s) missing from the en catalog. ` +
      'Run `pnpm run gen:translations` and rebuild.\n  ' +
      [...missing].slice(0, 20).join('\n  '),
  );
}

console.log(
  `[i18n] ${scanned.size} referenced id(s) resolve across ${locales.length} catalogs (${enCatalog.size} entries each)`,
);
