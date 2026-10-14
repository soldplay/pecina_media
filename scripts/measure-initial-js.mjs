#!/usr/bin/env node
/**
 * JS-Budget (DESIGN_SPEC §6.1: „JS initial `/` ohne 3D-Chunk ≤ 170 KB gzip“).
 * Node ohne Dependencies, liest nur den Produktions-Build (vorher `npm run build`).
 *
 * Methode (reproduzierbar, unabhaengig vom Browser):
 *   1. HTML der Route lesen: prerendertes `.next/server/app/<route>.html`
 *      oder mit `--url http://localhost:3124/` vom laufenden `next start`.
 *   2. Initial-JS = alle `<script src="/_next/static/…js">` OHNE `noModule`
 *      (Polyfill-Chunk, laedt in modernen Browsern nicht) plus alle
 *      `<link rel="preload" as="script">`. Genau diese Dateien laedt der Browser
 *      vor bzw. fuer die Hydration. Per `next/dynamic` / `import()` nachgeladene
 *      Chunks (3D-Szene, Menue, Cursor …) stehen nicht im HTML und zaehlen nicht.
 *   3. Jede Datei aus `.next/static/` mit zlib gzip (Stufe 6 = Default von
 *      `compression` in `next start`) packen und summieren. 1 KB = 1000 B; die Summe
 *      steht zusaetzlich in KiB (der Integrationsbericht hat per encodedBodySize in KiB
 *      gemessen: 288,7 KiB = 295,6 KB, reproduziert mit diesem Skript).
 *   Labels hinter den Dateien sind nur Textmarker (Orientierung), keine Modulanalyse.
 *
 * Optionen: --route / (Standard) · --url <URL> · --budget 170 · --strict (exit 1 bei Ueberschreitung)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXT_DIR = path.join(WEB_ROOT, '.next');
const GZIP_LEVEL = 6;
const KB = 1000;

/** Kennungen im Chunk-Text → lesbares Label (nur zur Orientierung). */
const MARKERS = [
  ['react-dom', /react-dom\.production|__reactContainer\$|Minified React error #/],
  ['next-runtime', /__next_f|next-router-state-tree|__NEXT_ROUTER/],
  ['gsap', /GreenSock|_gsap|gsap\.registerPlugin/],
  ['ScrollTrigger', /ScrollTrigger/],
  ['SplitText', /wordDelimiter|reduceWhiteSpace/],
  ['motion', /framer-motion|MotionConfig|motionValue|useMotionValue|AnimatePresence/],
  ['motion-drag/layout', /dragElastic|layoutDependency/],
  ['lenis', /lenis|Lenis/],
  ['site.ts-Texte', /"entwurf"/],
];

const out = (line = '') => process.stdout.write(`${line}\n`);

function readArgs(argv) {
  const value = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    route: value('--route', '/'),
    url: value('--url', null),
    budgetKb: Number(value('--budget', '170')),
    strict: argv.includes('--strict'),
  };
}

async function readHtml({ route, url }) {
  if (url) {
    const res = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
    if (!res.ok) throw new Error(`${url} antwortet mit ${res.status}.`);
    return { source: url, html: await res.text() };
  }
  const name = route === '/' ? 'index' : route.replace(/^\//, '');
  const file = path.join(NEXT_DIR, 'server', 'app', `${name}.html`);
  return { source: path.relative(WEB_ROOT, file), html: readFileSync(file, 'utf8') };
}

/** Script-URLs aus <script src> (ohne noModule) und <link rel=preload as=script>. */
function collectScripts(html) {
  const urls = new Set();
  for (const [tag] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    if (/\bnoModule\b/i.test(tag)) continue;
    urls.add(tag.match(/\bsrc="([^"]+)"/)[1]);
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    if (/\brel="preload"/.test(tag) && /\bas="script"/.test(tag)) urls.add(tag.match(/\bhref="([^"]+)"/)?.[1]);
  }
  return [...urls].filter((u) => u?.startsWith('/_next/static/')).map((u) => u.split('?')[0]);
}

function measure(url) {
  const file = path.join(NEXT_DIR, decodeURIComponent(url.replace(/^\/_next\//, '')));
  const raw = readFileSync(file);
  const text = raw.toString('utf8');
  const labels = MARKERS.filter(([, re]) => re.test(text)).map(([name]) => name);
  return { url, raw: raw.length, gzip: gzipSync(raw, { level: GZIP_LEVEL }).length, labels };
}

const kb = (n) => (n / KB).toFixed(1);

async function main() {
  const args = readArgs(process.argv.slice(2));
  const { source, html } = await readHtml(args);
  let buildId = '–';
  try {
    buildId = readFileSync(path.join(NEXT_DIR, 'BUILD_ID'), 'utf8').trim();
  } catch {
    /* kein Build-Id lesbar: nur Anzeige */
  }
  const rows = collectScripts(html).map(measure).sort((a, b) => b.gzip - a.gzip);
  const total = rows.reduce((s, r) => ({ raw: s.raw + r.raw, gzip: s.gzip + r.gzip }), { raw: 0, gzip: 0 });

  out(`Initial-JS ${args.route} — Quelle ${source}, Build ${buildId}, gzip Stufe ${GZIP_LEVEL}`);
  out();
  rows.forEach((r) =>
    out(`${kb(r.gzip).padStart(7)} KB gz  ${kb(r.raw).padStart(7)} KB roh  ${r.url.replace('/_next/static/chunks/', '')}  ${r.labels.join(', ')}`),
  );
  out();
  out(
    `Summe: ${rows.length} Dateien, ${kb(total.gzip)} KB gzip (= ${(total.gzip / 1024).toFixed(1)} KiB; ${kb(total.raw)} KB roh), Budget ${args.budgetKb} KB`,
  );
  const over = total.gzip > args.budgetKb * KB;
  out(over ? `✗ ${kb(total.gzip - args.budgetKb * KB)} KB ueber Budget.` : '✓ Budget eingehalten.');
  if (over && args.strict) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`✗ Messung nicht moeglich: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
