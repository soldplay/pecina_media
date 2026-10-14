#!/usr/bin/env node
/**
 * Asset-Budget (DESIGN_SPEC §5.6, §6.1) — laeuft als `prebuild` und als
 * `npm run check:assets`. Node ohne Dependencies.
 *
 * Quelle: src/lib/scene/assets.ts. Gelesen werden beide Fassungen:
 *   - ASSET_MANIFEST_JSON (Template-Literal → JSON.parse), massgeblich
 *   - die Objekt-Literale (MODELS, HDRI, BUDGET) per Regex, nur zum Abgleich
 * Geprueft wird:
 *   - beide Fassungen stimmen ueberein (url, bytes, Budget)
 *   - Pfade klein geschrieben; Datei existiert in public/ mit exakt dieser
 *     Schreibweise (readdirSync-Vergleich, auch unter Windows)
 *   - tatsaechliche Bytes weichen hoechstens 1 % vom Manifest ab
 *   - Grenzen (hart, exit 1): initial ≤ 6 000 000 B, jedes GLB ≤ 1 000 000 B, ≤ 5 Modelle
 *   - Ziele aus §6.1 (Hinweis, kein Abbruch): initial ≤ 1,7 MB, gesamt ≤ 2,8 MB
 *   - initial/idlePrefetch verweisen nur auf Manifest-Eintraege
 *   - public/models und public/hdri enthalten nur Manifest-Dateien (hart): alles in public/
 *     wird ausgeliefert und ist oeffentlich abrufbar. Nicht genutzte, schon optimierte Dateien
 *     liegen in assets_src/optimized_unused/ (ausserhalb von web/).
 * Ausgabe als Tabelle; exit 1 bei jedem Verstoss.
 *
 * Optionen (fuer Tests mit Fixtures): --manifest <assets.ts> --public <public-Ordner>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Harte Grenzen laut Spec; das Manifest muss dieselben Werte tragen. */
const LIMITS = Object.freeze({ initialBytesMax: 6_000_000, modelBytesMax: 1_000_000, maxModels: 5 });
/** Ziele aus §6.1 (nur Hinweis). */
const TARGETS = Object.freeze({ initialBytes: 1_700_000, totalBytes: 2_800_000 });
const MAX_SIZE_DEVIATION = 0.01;

// ------------------------------------------------------------ Ausgabe

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line = '') => process.stderr.write(`${line}\n`);

function formatBytes(n) {
  return typeof n === 'number' ? n.toLocaleString('de-AT') : '–';
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  out(line(headers));
  out(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => out(line(r)));
}

// ------------------------------------------------------------ Argumente

function readArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : null;
  };
  return {
    manifest: value('--manifest') ?? path.join(WEB_ROOT, 'src', 'lib', 'scene', 'assets.ts'),
    publicDir: value('--public') ?? path.join(WEB_ROOT, 'public'),
  };
}

// ------------------------------------------------------------ Manifest lesen

function parseJsonManifest(source) {
  const match = source.match(/export\s+const\s+ASSET_MANIFEST_JSON\s*=\s*`([\s\S]*?)`/);
  if (!match) throw new Error('ASSET_MANIFEST_JSON nicht gefunden.');
  if (match[1].includes('${')) throw new Error('ASSET_MANIFEST_JSON enthaelt Template-Ausdruecke.');
  return JSON.parse(match[1]);
}

/** url/bytes-Paare und BUDGET aus den TS-Objekt-Literalen (Text vor ASSET_MANIFEST_JSON). */
function parseLiteralManifest(source) {
  const head = source.split(/export\s+const\s+ASSET_MANIFEST_JSON/)[0];
  const entries = [...head.matchAll(/url:\s*['"]([^'"]+)['"],\s*bytes:\s*([\d_]+)/g)].map((m) => ({
    url: m[1],
    bytes: Number(m[2].replaceAll('_', '')),
  }));
  const budgetValue = (key) => {
    const m = head.match(new RegExp(`${key}:\\s*([\\d_]+)`));
    return m ? Number(m[1].replaceAll('_', '')) : null;
  };
  return {
    entries,
    budget: {
      initialBytesMax: budgetValue('initialBytesMax'),
      modelBytesMax: budgetValue('modelBytesMax'),
      maxModels: budgetValue('maxModels'),
    },
  };
}

function toAssetList(json) {
  const models = Object.entries(json.models ?? {}).map(([key, m]) => ({ key, kind: 'glb', url: m.url, bytes: m.bytes }));
  const hdri = Object.entries(json.hdri ?? {}).map(([key, h]) => ({ key, kind: 'hdri', url: h.url, bytes: h.bytes }));
  return [...models, ...hdri];
}

// ------------------------------------------------------------ Pruefungen

function compareFassungen(assets, json, literal, errors) {
  const literalByUrl = new Map(literal.entries.map((e) => [e.url, e.bytes]));
  assets.forEach((a) => {
    if (!literalByUrl.has(a.url)) errors.push(`Abgleich: ${a.url} fehlt in den Objekt-Literalen (MODELS/HDRI).`);
    else if (literalByUrl.get(a.url) !== a.bytes)
      errors.push(`Abgleich: ${a.url} bytes JSON ${a.bytes} ≠ Literal ${literalByUrl.get(a.url)}.`);
  });
  const jsonUrls = new Set(assets.map((a) => a.url));
  literal.entries
    .filter((e) => !jsonUrls.has(e.url))
    .forEach((e) => errors.push(`Abgleich: ${e.url} steht nur in den Objekt-Literalen, nicht in ASSET_MANIFEST_JSON.`));
  Object.entries(LIMITS).forEach(([key, limit]) => {
    const fromJson = json.budget?.[key];
    const fromLiteral = literal.budget[key];
    if (fromJson !== limit || fromLiteral !== limit)
      errors.push(`Budget ${key}: Spec ${limit}, JSON ${fromJson ?? '–'}, Literal ${fromLiteral ?? '–'}.`);
  });
}

/** Prueft jedes Pfadsegment per readdirSync auf exakte Schreibweise. */
function resolveExact(publicDir, url) {
  const segments = url.replace(/^\//, '').split('/');
  let dir = publicDir;
  for (const segment of segments) {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return { ok: false, reason: `Ordner fehlt: ${path.relative(publicDir, dir) || '.'}` };
    }
    if (!names.includes(segment)) {
      const near = names.find((n) => n.toLowerCase() === segment.toLowerCase());
      return { ok: false, reason: near ? `Schreibweise weicht ab: „${near}“ statt „${segment}“` : 'Datei fehlt' };
    }
    dir = path.join(dir, segment);
  }
  return { ok: true, file: dir };
}

function checkAsset(asset, publicDir, errors) {
  const problems = [];
  if (asset.url !== asset.url.toLowerCase()) problems.push('Grossbuchstaben im Pfad');
  if (!asset.url.startsWith('/')) problems.push('Pfad beginnt nicht mit /');
  const found = resolveExact(publicDir, asset.url);
  let actual = null;
  let deviation = null;
  if (!found.ok) problems.push(found.reason);
  else {
    actual = statSync(found.file).size;
    deviation = asset.bytes > 0 ? Math.abs(actual - asset.bytes) / asset.bytes : Infinity;
    if (deviation > MAX_SIZE_DEVIATION) problems.push(`Groesse weicht ${(deviation * 100).toFixed(2)} % ab`);
  }
  if (asset.kind === 'glb' && (actual ?? asset.bytes) > LIMITS.modelBytesMax)
    problems.push(`GLB > ${formatBytes(LIMITS.modelBytesMax)} B`);
  problems.forEach((p) => errors.push(`${asset.url}: ${p}`));
  return [
    asset.kind,
    asset.url,
    formatBytes(asset.bytes),
    formatBytes(actual),
    deviation === null ? '–' : `${(deviation * 100).toFixed(2)} %`,
    problems.length ? 'FEHLER' : 'ok',
  ];
}

function checkLists(json, assets, errors) {
  const known = new Map(assets.map((a) => [a.url, a]));
  const initial = json.initial ?? [];
  [...initial, ...(json.idlePrefetch ?? [])]
    .filter((url) => !known.has(url))
    .forEach((url) => errors.push(`initial/idlePrefetch: ${url} ist kein Manifest-Eintrag.`));
  const initialBytes = initial.reduce((sum, url) => sum + (known.get(url)?.bytes ?? 0), 0);
  const totalBytes = assets.reduce((sum, a) => sum + a.bytes, 0);
  const modelCount = assets.filter((a) => a.kind === 'glb').length;
  if (initialBytes > LIMITS.initialBytesMax)
    errors.push(`Initial ${formatBytes(initialBytes)} B > ${formatBytes(LIMITS.initialBytesMax)} B.`);
  if (modelCount > LIMITS.maxModels) errors.push(`${modelCount} Modelle > ${LIMITS.maxModels}.`);
  return { initialBytes, totalBytes, modelCount };
}

function listUnreferenced(publicDir, assets) {
  const used = new Set(assets.map((a) => a.url));
  return ['models', 'hdri'].flatMap((dir) => {
    try {
      return readdirSync(path.join(publicDir, dir))
        .map((name) => `/${dir}/${name}`)
        .filter((url) => !used.has(url));
    } catch {
      return [];
    }
  });
}

// ------------------------------------------------------------ Ablauf

function main() {
  const args = readArgs(process.argv.slice(2));
  const errors = [];
  const warnings = [];

  const source = readFileSync(args.manifest, 'utf8');
  const json = parseJsonManifest(source);
  const literal = parseLiteralManifest(source);
  const assets = toAssetList(json);

  compareFassungen(assets, json, literal, errors);
  out(`Asset-Budget — ${path.relative(process.cwd(), args.manifest) || args.manifest}`);
  out();
  printTable(
    ['Art', 'Pfad', 'Manifest B', 'Ist B', 'Abw.', 'Status'],
    assets.map((a) => checkAsset(a, args.publicDir, errors)),
  );

  const { initialBytes, totalBytes, modelCount } = checkLists(json, assets, errors);
  if (initialBytes > TARGETS.initialBytes) warnings.push(`Initial ${formatBytes(initialBytes)} B > Ziel ${formatBytes(TARGETS.initialBytes)} B (§6.1).`);
  if (totalBytes > TARGETS.totalBytes) warnings.push(`Gesamt ${formatBytes(totalBytes)} B > Ziel ${formatBytes(TARGETS.totalBytes)} B (§6.1).`);
  listUnreferenced(args.publicDir, assets).forEach((url) =>
    errors.push(`${url}: liegt in public/, steht aber nicht im Manifest (wird ausgeliefert, aber nie geladen) — nach assets_src/optimized_unused/ verschieben.`),
  );

  out();
  printTable(
    ['Summe', 'Wert', 'Grenze'],
    [
      ['initial', `${formatBytes(initialBytes)} B`, `≤ ${formatBytes(LIMITS.initialBytesMax)} B (Ziel ${formatBytes(TARGETS.initialBytes)})`],
      ['gesamt', `${formatBytes(totalBytes)} B`, `Ziel ≤ ${formatBytes(TARGETS.totalBytes)} B`],
      ['Modelle', String(modelCount), `≤ ${LIMITS.maxModels}`],
    ],
  );

  warnings.forEach((w) => out(`Hinweis: ${w}`));
  if (errors.length) {
    err(`\n✗ Asset-Budget verletzt (${errors.length}):`);
    errors.forEach((e) => err(`  - ${e}`));
    process.exit(1);
  }
  out('\n✓ Asset-Budget eingehalten.');
}

try {
  main();
} catch (error) {
  err(`✗ Asset-Budget nicht pruefbar: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
