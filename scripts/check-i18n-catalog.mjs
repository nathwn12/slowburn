#!/usr/bin/env node
/**
 * Release guard: fail the build when any compiled message id in `dist` is
 * absent from the English catalog, or when the shipped English catalog is
 * missing/empty.
 *
 * Why: in production the macro strips the descriptor's `message` and ships
 * `{id}` only, so a catalog miss renders the raw id (a short hash). Dev and the
 * whole test suite keep the message and render fine - so a stale catalog is
 * invisible until someone runs the built app.
 *
 * The check is deliberately fail-loud: it exits 1 when it cannot find the
 * catalogs, when the English chunk is missing/empty, or when it scanned zero
 * ids (which is what a descriptor-shape change would look like).
 *
 * English-only: this fork ships a single locale, so only `en` is checked.
 */
import { createHash } from 'node:crypto';
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

// Resolve the English compiled chunk by prefix rather than a hard-coded name.
// The Lingui/Vite build emits the catalog for `src/translations/en.po` as
// `en-<hash>.js`; a chunk that cannot be found fails the build loudly instead
// of being skipped.
//
// English-only static import: `src/lib/i18n.ts` imports `en.po` statically,
// so Vite inlines the catalog into the main chunk and no `en-<hash>.js` file
// is emitted. In that case fall back to the msgids in `src/translations/en.po`
// itself (the exact source the inlined catalog is compiled from).
function parsePoMsgids(source) {
  const ids = new Set();
  let current = null;
  const push = () => {
    if (current !== null && current !== '') ids.add(current);
    current = null;
  };
  for (const line of source.split('\n')) {
    const start = /^msgid\s+"((?:[^"\\]|\\.)*)"/.exec(line);
    if (start != null) {
      push();
      current = JSON.parse(`"${start[1]}"`);
      continue;
    }
    if (current !== null) {
      const cont = /^\s+"((?:[^"\\]|\\.)*)"/.exec(line);
      if (cont != null) {
        current += JSON.parse(`"${cont[1]}"`);
        continue;
      }
      push();
    }
  }
  push();
  return ids;
}

async function loadCatalog(locale) {
  const file = files.find(
    (name) => name.startsWith(`${locale}-`) && name.endsWith('.js'),
  );
  if (file == null) {
    if (locale !== 'en')
      fail(`no compiled ${locale} catalog chunk in ${ASSETS}`);
    let source;
    try {
      source = readFileSync(join(LOCALES_DIR, `${locale}.po`), 'utf8');
    } catch {
      fail(`no compiled ${locale} catalog chunk in ${ASSETS}`);
    }
    const keys = parsePoMsgids(source);
    if (keys.size === 0) {
      // No usable catalog anywhere: keep the original chunk error so the
      // missing-catalog case still fails with the established message.
      fail(`no compiled ${locale} catalog chunk in ${ASSETS}`);
    }
    // The compiled catalog keys are not the raw msgids: Lingui hashes each
    // `msgid` (+ `\u001F` + context) into a 6-char id at compile time - the
    // same ids the macro emits into the bundle. Replicate
    // `@lingui/message-utils/generateMessageId` (node variant) with the
    // standard library so this guard needs no extra dependency.
    const hashed = new Set(
      [...keys].map((msgid) =>
        createHash('sha256')
          .update(msgid + String.fromCharCode(31), 'utf8')
          .digest('base64url')
          .slice(0, 6),
      ),
    );
    console.log(
      `[i18n] en catalog inlined in main chunk; ${locale}.po source: ${hashed.size} entries`,
    );
    return { file: `${locale}.po (inlined)`, keys: hashed };
  }
  const module = await import(pathToFileURL(join(ASSETS, file)).href);
  const keys = Object.keys(module.messages ?? {});
  if (keys.length === 0) {
    fail(`${locale} catalog ${file} is empty`);
  }
  return { file, keys: new Set(keys) };
}

const { file: enFile, keys: enCatalog } = await loadCatalog('en');
console.log(`[i18n] en catalog ${enFile}: ${enCatalog.size} entries`);

// A compiled Lingui descriptor is an object literal whose fields come from the
// MessageDescriptor / `<Trans>` surface (id, message, comment, context, values,
// components). Other `{id:...}` literals are data - TanStack routes carry
// `path`/`getParentRoute`, the sort presets carry `labelKey`/`keys` - and must
// not be mistaken for messages. Identify a descriptor by its field set rather
// than an id length/charset heuristic: that heuristic is what previously
// flagged the sort presets (album / artistAlbum / length / mostPlayed) as
// missing catalog ids. `id` is always the first field the macro emits.
const DESCRIPTOR_FIELDS = new Set([
  'id',
  'message',
  'comment',
  'context',
  'values',
  'components',
  'formats',
]);
const ID_START_RE = /\{id:\s*(?:`([^`]+)`|"([^"]+)")/g;

/**
 * Top-level field names of the object literal starting at `openIndex`,
 * skipping string/template literals and nested braces/brackets/parens.
 */
function readTopLevelFields(code, openIndex) {
  const fields = [];
  let depth = 0;
  let expectField = false;
  for (let i = openIndex; i < code.length; i++) {
    const char = code[i];
    if (char === '`' || char === '"' || char === "'") {
      for (i++; i < code.length; i++) {
        if (code[i] === '\\') i++;
        else if (code[i] === char) break;
      }
      continue;
    }
    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      if (depth === 1 && char === '{') expectField = true;
      continue;
    }
    if (char === '}' || char === ']' || char === ')') {
      depth -= 1;
      if (depth === 0) return fields;
      continue;
    }
    if (depth === 1 && expectField) {
      const field = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(code.slice(i));
      if (field != null) {
        fields.push(field[1]);
        i += field[0].length - 1;
      }
      expectField = false;
      continue;
    }
    if (depth === 1 && char === ',') {
      expectField = true;
    }
  }
  return fields;
}

const scanned = new Set();
const missing = new Set();
for (const file of files) {
  const code = readFileSync(join(ASSETS, file), 'utf8');
  for (const match of code.matchAll(ID_START_RE)) {
    const fields = readTopLevelFields(code, match.index);
    if (!fields.every((field) => DESCRIPTOR_FIELDS.has(field))) continue;
    const id = match[1] ?? match[2];
    scanned.add(id);
    if (!enCatalog.has(id)) missing.add(id);
  }
}

// A zero-id scan means the descriptor shape changed and this guard can no
// longer see the build; that must fail, not pass silently.
if (scanned.size === 0) {
  fail(
    'scanned 0 message ids - the compiled descriptor shape changed; update ID_START_RE',
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
  `[i18n] ${scanned.size} referenced id(s) resolve against the en catalog (${enCatalog.size} entries)`,
);
