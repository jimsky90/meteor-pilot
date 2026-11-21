#!/usr/bin/env node
/* Builds mobile/www/ (the files inside the store app) from the web game in the repo root.
   - index.html is copied with the game section (GAME:START..GAME:END) byte-for-byte unchanged.
   - Google Fonts links become local font files from @fontsource (F9).
   - The service worker registration is removed (F9), and sw.js / the web manifest are not copied.
   - native.js (the Capacitor bridge) is injected in <head>, before the game.
   Usage: node scripts/build-www.mjs [--allow-missing-fonts]
   --allow-missing-fonts: for machines that can't run `npm install`; writes the same fonts.css but warns that the
   .woff2 files are missing. Never use it for a real store build (Codemagic runs without it). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(MOBILE, "..");
const WWW = path.join(MOBILE, "www");
const ALLOW_MISSING_FONTS = process.argv.includes("--allow-missing-fonts");
const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE, "package.json"), "utf8"));
const WEB_URL = pkg.meteorPilot.webUrl;
const warnings = [];

function fail(msg) { console.error("build-www: ERROR: " + msg); process.exit(1); }
function warn(msg) { warnings.push(msg); console.warn("build-www: WARNING: " + msg); }

/* ---------- read the game ---------- */
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const gs = src.indexOf("<!-- GAME:START -->"), ge = src.indexOf("<!-- GAME:END -->");
if (gs < 0 || ge < gs) fail("index.html has no GAME:START / GAME:END markers");
const GAME_END = ge + "<!-- GAME:END -->".length;
let head = src.slice(0, gs);           /* app shell before the game: <head> */
const game = src.slice(gs, GAME_END);  /* never touched */
let tail = src.slice(GAME_END);        /* app shell after the game: service worker, install button */

/* ---------- fonts: Google Fonts link -> local @fontsource files ---------- */
const fontFaces = [], fontFiles = [];
const linkRe = /[ \t]*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>[ \t]*\r?\n?/g;
const cssLinks = [...head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"[^>]*>/g)].map(m => m[1]);
for (const href of cssLinks) {
  const q = href.split("?")[1].replace(/&amp;/g, "&");
  for (const part of q.split("&")) {
    if (!part.startsWith("family=")) continue;
    const [fam, spec] = decodeURIComponent(part.slice(7).replace(/\+/g, " ")).split(":");
    const weights = spec && spec.startsWith("wght@") ? spec.slice(5).split(";").map(Number) : [400];
    const slug = fam.toLowerCase().replace(/\s+/g, "-");
    const dir = path.join(MOBILE, "node_modules", "@fontsource", slug, "files");
    for (const w of weights) {
      const file = `${slug}-latin-${w}-normal.woff2`;
      const from = path.join(dir, file);
      if (fs.existsSync(from)) fontFiles.push([from, file]);
      else if (ALLOW_MISSING_FONTS) warn(`font file missing (run npm install): @fontsource/${slug}/files/${file}`);
      else fail(`font file missing: ${from}. Run "npm install" in mobile/ (the package @fontsource/${slug} is needed).`);
      fontFaces.push(`@font-face {\n  font-family: "${fam}";\n  font-style: normal;\n  font-weight: ${w};\n  font-display: swap;\n` +
        `  src: url("${file}") format("woff2");\n` +
        `  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;\n}`);
    }
  }
}
if (cssLinks.length) {
  let placed = false;
  head = head.replace(linkRe, m => {
    if (!placed && /rel="stylesheet"/.test(m)) { placed = true; return '<link rel="stylesheet" href="fonts/fonts.css">\n'; }
    return "";
  });
} else if (!head.includes('href="fonts/fonts.css"')) {
  warn("no Google Fonts stylesheet link found in index.html; the game may already bundle its fonts");
}

/* ---------- web-only head items ---------- */
head = head.replace(/[ \t]*<link rel="manifest"[^>]*>[ \t]*\r?\n?/, "");

/* ---------- remove the service worker registration (app shell only) ---------- */
function removeBlockContaining(text, needle) {
  const i = text.indexOf(needle);
  if (i < 0) return [text, false];
  const ifAt = text.lastIndexOf("if", i);
  const open = text.indexOf("{", i);
  if (ifAt < 0 || open < 0) return [text, false];
  let depth = 0, j = open;
  for (; j < text.length; j++) {
    const c = text[j];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  if (depth !== 0) fail("could not parse the service worker block in the app shell");
  let start = text.lastIndexOf("\n", ifAt) + 1, end = j + 1;
  if (text[end] === "\n") end++;
  return [text.slice(0, start) + "  /* store app: no service worker (removed by mobile/scripts/build-www.mjs) */\n" + text.slice(end), true];
}
let swRemoved;
[tail, swRemoved] = removeBlockContaining(tail, '"serviceWorker" in navigator');
if (!swRemoved && /serviceWorker\s*\.\s*register/.test(tail)) fail("found serviceWorker.register in the app shell but could not remove it");
if (/serviceWorker\s*\.\s*register/.test(head)) fail("serviceWorker.register found in <head>; move it to the app shell after GAME:END");
if (/serviceWorker\s*\.\s*register/.test(game)) {
  /* The game section is never edited. native.js also blocks registration at runtime, so this is safe, but say so. */
  warn("serviceWorker.register appears inside the game section; native.js blocks it at runtime");
}

/* ---------- inject the native bridge before the game ---------- */
if (!head.includes("</head>")) fail("no </head> in the part before GAME:START");
head = head.replace("</head>", '<script src="native.js"></script>\n</head>');

/* ---------- write www/ ---------- */
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, "fonts"), { recursive: true });
const out = head + game + tail;
if (out.slice(out.indexOf("<!-- GAME:START -->"), out.indexOf("<!-- GAME:END -->") + 17) !== game) fail("game section changed during the build");
fs.writeFileSync(path.join(WWW, "index.html"), out);
let bridge = fs.readFileSync(path.join(MOBILE, "native.js"), "utf8");
if (!bridge.includes("__WEB_URL__")) fail("native.js lost its __WEB_URL__ placeholder");
bridge = bridge.replace(/__WEB_URL__/g, WEB_URL);
fs.writeFileSync(path.join(WWW, "native.js"), bridge);
for (const [from, file] of fontFiles) fs.copyFileSync(from, path.join(WWW, "fonts", file));
fs.writeFileSync(path.join(WWW, "fonts", "fonts.css"), "/* Bundled from @fontsource (Latin subset) by build-www.mjs. */\n" + fontFaces.join("\n") + "\n");
fs.cpSync(path.join(ROOT, "icons"), path.join(WWW, "icons"), { recursive: true });
/* privacy.html is not bundled: the app opens the hosted policy in the system browser (it also loads Google Fonts). */

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) {}
const swv = (fs.readFileSync(path.join(ROOT, "sw.js"), "utf8").match(/VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
fs.writeFileSync(path.join(WWW, "build-info.json"), JSON.stringify({
  game: swv, commit, builtAt: new Date().toISOString(), fontsBundled: fontFiles.length, fontsExpected: fontFaces.length, warnings
}, null, 2) + "\n");

console.log(`build-www: wrote ${path.relative(ROOT, WWW)}/ (game ${swv}, ${fontFiles.length}/${fontFaces.length} font files, service worker ${swRemoved ? "removed" : "not found"})`);
if (warnings.length) console.log(`build-www: ${warnings.length} warning(s)`);
