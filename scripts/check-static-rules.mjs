#!/usr/bin/env node
/**
 * Statische Regeln (DESIGN_SPEC §4.4, §5.6, §5.8, §6.2) — `npm run check:rules`.
 * Node ohne Dependencies. Scannt src/** (.ts .tsx .js .jsx .mjs .cjs .css) und
 * meldet Fundstellen als datei:zeile:spalte; exit 1 bei mindestens einem Fund.
 *
 * Kommentare zaehlen nie. Regeln, die nur Code betreffen, sehen auch keine
 * String-Inhalte (z. B. Inline-Scripts in Template-Literalen).
 *
 * Regeln:
 *   cursor-none      `cursor: none` (CSS/Style-Objekt) bzw. Klasse `cursor-none`
 *   forbidden-import Import von `zustand` oder `framer-motion`
 *   draco            'draco' im Code; useGLTF/useGLTF.preload ohne `false` als 2. Argument
 *   env-preset       drei <Environment preset=…>, useEnvironment({ preset }), <Stage> ohne environment={null}
 *   asset-case       Modell-/HDRI-Pfad (.glb/.gltf/.hdr/.exr, /models/, /hdri/) mit Grossbuchstaben
 *   asset-missing    /models/- bzw. /hdri/-Literal ohne Datei in public/ (exakte Schreibweise)
 *   server-impure    Math.random( / new Date( / Date.now( in src/app ohne 'use client'
 *   storage-no-try   localStorage/sessionStorage ausserhalb eines try-Blocks (Heuristik)
 *   infinite-motion  CSS `animation…: … infinite`; Style `infinite`, Klassen animate-spin|ping|pulse|bounce,
 *                    GSAP `repeat: -1`, motion `repeat: Infinity`
 *
 * Optionen (fuer Tests mit Fixtures): --root <src-Ordner> --public <public-Ordner>
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'build']);
const ASSET_EXTENSION = /\.(glb|gltf|hdr|exr|ktx2|bin|jpe?g|png|webp|avif)$/i;
const MODEL_EXTENSION = /\.(glb|gltf|hdr|exr)$/i;
const REGEX_PREFIX = new Set([...'(,=:[!&|?{};+-*%~^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'yield', 'await', 'delete', 'throw', 'new']);

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line = '') => process.stderr.write(`${line}\n`);

// ------------------------------------------------------------ Argumente, Dateien

function readArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : null;
  };
  return {
    root: value('--root') ?? path.join(WEB_ROOT, 'src'),
    publicDir: value('--public') ?? path.join(WEB_ROOT, 'public'),
  };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    const ext = path.extname(entry.name);
    return CODE_EXTENSIONS.has(ext) || ext === '.css' ? [full] : [];
  });
}

// ------------------------------------------------------------ Quelltext-Sichten

/**
 * Liefert zwei gleich lange Sichten (Zeilenumbrueche bleiben erhalten):
 *   text: Kommentare durch Leerzeichen ersetzt
 *   code: zusaetzlich String-, Template- und Regex-Inhalte geleert (Quotes bleiben)
 */
const WORD_CHAR = /[A-Za-z0-9_$]/;

/** Lokaler Scanner-Zustand (nur innerhalb von stripJs veraendert). */
function createScanner(source) {
  return { src: source, text: [...source], code: [...source], stack: [{ type: 'code', depth: 0 }], i: 0, lastSig: '', word: '' };
}

function blank(chars, i) {
  if (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
}

function blankBoth(s, from, to) {
  for (let j = from; j < to; j += 1) {
    blank(s.text, j);
    blank(s.code, j);
  }
}

/** Inhalt bis zum schliessenden Zeichen leeren (String: Quote, Regex: '/' ausserhalb [...]); Zeilenende bricht ab. */
function skipLiteral(s, start, isRegex) {
  const quote = s.src[start];
  let j = start + 1;
  let inClass = false;
  while (j < s.src.length && s.src[j] !== '\n' && (inClass || s.src[j] !== quote)) {
    if (s.src[j] === '\\') blank(s.code, j++);
    else if (isRegex && s.src[j] === '[') inClass = true;
    else if (isRegex && s.src[j] === ']') inClass = false;
    blank(s.code, j++);
  }
  j += 1;
  while (isRegex && j < s.src.length && /[a-z]/i.test(s.src[j])) j += 1;
  return j;
}

function stepTemplate(s) {
  const c = s.src[s.i];
  if (c === '\\') {
    blank(s.code, s.i);
    blank(s.code, s.i + 1);
    s.i += 2;
  } else if (c === '`') {
    s.stack.pop();
    s.lastSig = '`';
    s.i += 1;
  } else if (c === '$' && s.src[s.i + 1] === '{') {
    s.stack.push({ type: 'expr', depth: 0 });
    s.lastSig = '{';
    s.i += 2;
  } else {
    blank(s.code, s.i);
    s.i += 1;
  }
}

/** Kommentare, Strings, Templates, Regex; true, wenn das Zeichen verbraucht wurde. */
function stepLiteral(s) {
  const c = s.src[s.i];
  const d = s.src[s.i + 1];
  if (c === '/' && d === '/') {
    const end = s.src.indexOf('\n', s.i);
    const stop = end < 0 ? s.src.length : end;
    blankBoth(s, s.i, stop);
    s.i = stop;
  } else if (c === '/' && d === '*') {
    const end = s.src.indexOf('*/', s.i + 2);
    const stop = end < 0 ? s.src.length : end + 2;
    blankBoth(s, s.i, stop);
    s.i = stop;
  } else if (c === "'" || c === '"' || (c === '/' && (s.lastSig === '' || REGEX_PREFIX.has(s.lastSig) || REGEX_KEYWORDS.has(s.word)))) {
    s.i = skipLiteral(s, s.i, c === '/');
    s.lastSig = c;
    s.word = '';
  } else if (c === '`') {
    s.stack.push({ type: 'template' });
    s.i += 1;
  } else {
    return false;
  }
  return true;
}

function stepCode(s) {
  if (stepLiteral(s)) return;
  const top = s.stack[s.stack.length - 1];
  const c = s.src[s.i];
  if (top.type === 'expr' && c === '{') top.depth += 1;
  if (top.type === 'expr' && c === '}') {
    if (top.depth === 0) {
      s.stack.pop();
      s.i += 1;
      return;
    }
    top.depth -= 1;
  }
  if (WORD_CHAR.test(c)) s.word = WORD_CHAR.test(s.src[s.i - 1] ?? '') ? s.word + c : c;
  else if (!/\s/.test(c)) s.word = '';
  if (!/\s/.test(c)) s.lastSig = c;
  s.i += 1;
}

function stripJs(source) {
  const s = createScanner(source);
  while (s.i < source.length) {
    if (s.stack[s.stack.length - 1].type === 'template') stepTemplate(s);
    else stepCode(s);
  }
  return { text: s.text.join(''), code: s.code.join('') };
}

function stripCss(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return { text, code: text };
}

// ------------------------------------------------------------ Fundstellen

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') starts.push(i + 1);
  return starts;
}

function makeReporter(file, source, findings) {
  const starts = lineStarts(source);
  return (index, rule, message) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= index) line += 1;
    const excerpt = source.slice(starts[line], starts[line + 1] ?? source.length).trim().slice(0, 140);
    findings.push({ file, line: line + 1, col: index - starts[line] + 1, rule, message, excerpt });
  };
}

function eachMatch(view, regex, fn) {
  for (const m of view.matchAll(regex)) fn(m);
}

// ------------------------------------------------------------ Regeln

function ruleCursorNone({ text }, report) {
  eachMatch(text, /cursor\s*:\s*['"`]?\s*none\b/g, (m) => report(m.index, 'cursor-none', '`cursor: none` versteckt den Systemzeiger (§4.4).'));
  eachMatch(text, /(^|[\s'"`:])(cursor-none)(?=[\s'"`]|$)/gm, (m) =>
    report(m.index + m[1].length, 'cursor-none', 'Klasse `cursor-none` versteckt den Systemzeiger (§4.4).'),
  );
}

function ruleForbiddenImports({ text }, report) {
  const pkg = '(zustand|framer-motion)(?:\\/[^\'"]*)?';
  const patterns = [
    new RegExp(`\\bfrom\\s*['"]${pkg}['"]`, 'g'),
    new RegExp(`\\bimport\\s*['"]${pkg}['"]`, 'g'),
    new RegExp(`\\b(?:import|require)\\s*\\(\\s*['"]${pkg}['"]`, 'g'),
  ];
  patterns.forEach((re) =>
    eachMatch(text, re, (m) => report(m.index, 'forbidden-import', `Import von '${m[1]}' (zustand: Phantom-Dependency; framer-motion: motion/react nutzen).`)),
  );
}

/** Argumente eines Aufrufs ab der oeffnenden Klammer, getrennt an Kommas auf oberster Ebene. */
function callArguments(views, openIndex) {
  const args = [];
  let depth = 0;
  let start = openIndex + 1;
  for (let i = openIndex; i < views.code.length; i += 1) {
    const c = views.code[i];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    if (depth === 0) {
      args.push(views.text.slice(start, i).trim());
      return args.filter((a, idx) => a !== '' || idx < args.length - 1);
    }
    if (depth === 1 && c === ',') {
      args.push(views.text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

function ruleDraco(views, report) {
  eachMatch(views.text, /draco/gi, (m) => report(m.index, 'draco', "'draco' im Code: drei laedt den Decoder sonst von gstatic (§5.6)."));
  eachMatch(views.code, /\buseGLTF(?:\s*\.\s*preload)?\s*\(/g, (m) => {
    const args = callArguments(views, m.index + m[0].length - 1);
    if (args[1] !== 'false')
      report(m.index, 'draco', `useGLTF ohne false als 2. Argument (gefunden: ${args[1] ?? 'fehlt'}); Pflicht: useGLTF(url, false, true).`);
  });
}

function ruleEnvironmentPreset({ text }, report) {
  eachMatch(text, /<Environment\b[^>]*?\bpreset\s*=/g, (m) => report(m.index, 'env-preset', 'drei-Environment-Preset laedt vom CDN (§5.6).'));
  eachMatch(text, /\buseEnvironment\s*\(\s*\{[^}]*\bpreset\b/g, (m) => report(m.index, 'env-preset', 'useEnvironment mit preset laedt vom CDN (§5.6).'));
  eachMatch(text, /<Stage\b(?![^>]*\benvironment\s*=\s*\{\s*null\s*\})/g, (m) =>
    report(m.index, 'env-preset', "drei <Stage> laedt ohne environment={null} das Preset 'city' vom CDN."),
  );
}

/** Prueft jedes Pfadsegment per readdirSync auf exakte Schreibweise. */
function existsExact(publicDir, url) {
  let dir = publicDir;
  for (const segment of url.replace(/^\.?\//, '').split('/')) {
    try {
      if (!readdirSync(dir).includes(segment)) return false;
    } catch {
      return false;
    }
    dir = path.join(dir, segment);
  }
  return true;
}

function ruleAssetPaths({ text }, report, ctx) {
  eachMatch(text, /(['"`])([^'"`\n]*?)\1/g, (m) => {
    const value = m[2];
    const index = m.index + 1;
    const isAssetDir = /(^|\/)(models|hdri)\//.test(value);
    if (!isAssetDir && !MODEL_EXTENSION.test(value)) return;
    const staticPart = value.split('${')[0];
    if (/[A-Z]/.test(staticPart)) report(index, 'asset-case', `Asset-Pfad mit Grossbuchstaben: ${value} (Linux/Vercel ist case-sensitiv).`);
    if (!isAssetDir || value.includes('${') || !ASSET_EXTENSION.test(value)) return;
    const url = value.slice(value.search(/(models|hdri)\//));
    if (!existsExact(ctx.publicDir, url)) report(index, 'asset-missing', `Keine Datei public/${url} (exakte Schreibweise).`);
  });
}

function ruleServerImpure({ text, code }, report, ctx) {
  if (!ctx.isApp || /^\s*(['"])use client\1/.test(text)) return;
  eachMatch(code, /\bMath\s*\.\s*random\s*\(|\bnew\s+Date\s*\(|\bDate\s*\.\s*now\s*\(/g, (m) =>
    report(m.index, 'server-impure', `${m[0].replace(/\s+/g, ' ')}…) in einer Server-Datei unter src/app (mulberry32 aus lib/scene/math.ts bzw. statische Werte).`),
  );
}

function tryRanges(code) {
  const ranges = [];
  eachMatch(code, /\btry\s*\{/g, (m) => {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') depth -= 1;
      if (depth === 0) {
        ranges.push([open, i]);
        return;
      }
    }
    ranges.push([open, code.length]);
  });
  return ranges;
}

function ruleStorage({ code }, report) {
  const ranges = tryRanges(code);
  eachMatch(code, /\b(localStorage|sessionStorage)\b/g, (m) => {
    if (!ranges.some(([a, b]) => m.index > a && m.index < b))
      report(m.index, 'storage-no-try', `${m[1]} ausserhalb von try: Zugriff kann werfen (privater Modus, gesperrter Speicher).`);
  });
}

function ruleInfiniteMotion({ text, code }, report, ctx) {
  // CSS-Dateien und CSS in Strings/Template-Literalen (<style>-Bloecke in TSX).
  const cssDeclaration = ctx.isCss ? /animation(?:-iteration-count)?\s*:[^;{}]*\binfinite\b/g : /animation(?:-iteration-count)?\s*:[^;{}'"`]*\binfinite\b/g;
  eachMatch(ctx.isCss ? code : text, cssDeclaration, (m) =>
    report(m.index, 'infinite-motion', 'Endlos-Animation in CSS (keine autonome Bewegung > 5 s, §6.2).'),
  );
  if (ctx.isCss) return;
  const label = 'Endlos-Animation (keine autonome Bewegung > 5 s, §6.2)';
  eachMatch(text, /\banimation(?:IterationCount)?\s*:\s*['"`][^'"`\n]*\binfinite\b/g, (m) => report(m.index, 'infinite-motion', `${label}: Style.`));
  eachMatch(text, /(^|[\s'"`:])(animate-(?:spin|ping|pulse|bounce))(?=[\s'"`]|$)/gm, (m) =>
    report(m.index + m[1].length, 'infinite-motion', `${label}: Klasse ${m[2]}.`),
  );
  eachMatch(code, /\brepeat\s*:\s*(-\s*1\b|Infinity\b|Number\.POSITIVE_INFINITY\b)/g, (m) =>
    report(m.index, 'infinite-motion', `${label}: repeat ${m[1].replace(/\s+/g, '')}.`),
  );
}

const RULES = [ruleCursorNone, ruleForbiddenImports, ruleDraco, ruleEnvironmentPreset, ruleAssetPaths, ruleServerImpure, ruleStorage, ruleInfiniteMotion];

// ------------------------------------------------------------ Ablauf

function scanFile(file, args, findings) {
  const source = readFileSync(file, 'utf8');
  const isCss = path.extname(file) === '.css';
  const rel = path.relative(args.root, file).split(path.sep).join('/');
  const views = isCss ? stripCss(source) : stripJs(source);
  const ctx = { isCss, isApp: rel.startsWith('app/'), publicDir: args.publicDir };
  const report = makeReporter(path.relative(WEB_ROOT, file).split(path.sep).join('/'), source, findings);
  RULES.filter((rule) => !isCss || [ruleCursorNone, ruleInfiniteMotion].includes(rule)).forEach((rule) => rule(views, report, ctx));
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const files = walk(args.root);
  const findings = [];
  files.forEach((file) => scanFile(file, args, findings));

  out(`Statische Regeln — ${files.length} Dateien unter ${path.relative(process.cwd(), args.root) || args.root}`);
  if (findings.length === 0) {
    out('✓ Keine Verstoesse.');
    return;
  }
  err(`\n✗ ${findings.length} Verstoss/Verstoesse:`);
  const sorted = [...findings].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
  sorted.forEach((f) => {
    err(`${f.file}:${f.line}:${f.col}  [${f.rule}] ${f.message}`);
    err(`    > ${f.excerpt}`);
  });
  process.exit(1);
}

try {
  main();
} catch (error) {
  err(`✗ Regel-Pruefung abgebrochen: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
