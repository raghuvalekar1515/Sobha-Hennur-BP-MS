#!/usr/bin/env node
/**
 * Renames image files to SEO names and sets their alt text, everywhere at once.
 *
 *   node tools/rename-images.mjs path/to/mapping.json
 *
 * mapping.json maps an old base name to its new name and alt text:
 *
 *   {
 *     "gallery-7-sbp": {
 *       "name": "sobha-biopolis-pool-sobha-ayana",
 *       "alt": "Sobha Biopolis gallery: a swimming pool under large trees at SOBHA Ayana"
 *     }
 *   }
 *
 * For each entry it:
 *   - renames every variant under site/ (gallery-7-sbp.webp, gallery-7-sbp-400.avif, …),
 *     keeping the width suffix and extension;
 *   - rewrites every reference in site/ text files (HTML, CSS, JS, JSON-LD,
 *     sitemap, llms files, manifest);
 *   - sets alt="…" on every <img> showing that image, and og:image:alt /
 *     twitter:image:alt on pages whose og:image it is.
 * Then it fails if any old name is still referenced, or any referenced
 * image file is missing.
 *
 * Rule (CLAUDE.md, "Images"): names start with the project slug and say what
 * the picture shows, plus the project shown when it is another project's;
 * alt text starts with the project name and names the project shown.
 */
import { readFileSync, writeFileSync, readdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const IMG_EXT = '(?:webp|avif|jpe?g|png|gif|svg)';
const WIDTH = '(?:-\\d{3,4})?';  /* width variants: -400, -1060 */
const TEXT = /\.(html|css|js|mjs|json|txt|xml|webmanifest)$/;
const ORIGIN = (() => {
  try { return readFileSync(join(SITE, 'robots.txt'), 'utf8').match(/Sitemap:\s*(https?:\/\/[^/\s]+)/)[1]; } catch { return null; }
})();

const mapPath = process.argv[2];
if (!mapPath) { console.error('Usage: node tools/rename-images.mjs mapping.json'); process.exit(1); }
const mapping = JSON.parse(readFileSync(mapPath, 'utf8'));

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* 1. Rename files. */
let renamed = 0;
for (const file of walk(SITE)) {
  const name = basename(file);
  for (const [old, { name: neu }] of Object.entries(mapping)) {
    const m = name.match(new RegExp(`^${escapeRe(old)}(${WIDTH}\\.${IMG_EXT})$`));
    if (m) {
      const target = join(dirname(file), neu + m[1]);
      if (existsSync(target)) throw new Error(`${relative(ROOT, target)} already exists`);
      renameSync(file, target);
      renamed++;
    }
  }
}

/* 2. Rewrite references, alt text and og:image:alt. */
const byNewName = Object.fromEntries(Object.values(mapping).map(v => [v.name, v.alt]));
const baseOf = url => basename(url.split(/[?#]/)[0]).replace(new RegExp(`${WIDTH}\\.${IMG_EXT}$`), '');
let files = 0;
for (const file of walk(SITE).filter(f => TEXT.test(f))) {
  const before = readFileSync(file, 'utf8');
  let text = before;
  for (const [old, { name: neu }] of Object.entries(mapping)) {
    text = text.replace(new RegExp(`(?<=[/"'(\\s,=])${escapeRe(old)}(${WIDTH}\\.${IMG_EXT})`, 'g'), `${neu}$1`);
  }
  if (file.endsWith('.html')) {
    text = text.replace(/<img\b[^>]*>/g, tag => {
      const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
      const alt = src && byNewName[baseOf(src)];
      if (!alt) return tag;
      return /\salt="[^"]*"/.test(tag) ? tag.replace(/\salt="[^"]*"/, ` alt="${attr(alt)}"`) : tag.replace(/<img\b/, `<img alt="${attr(alt)}"`);
    });
    /* og:image and its alt, whichever order the attributes are written in. */
    const ogTag = text.match(/<meta\b[^>]*\bproperty="og:image"[^>]*>/)?.[0];
    const og = ogTag?.match(/\bcontent="([^"]+)"/)?.[1];
    const ogAlt = og && byNewName[baseOf(og)];
    if (ogAlt) {
      const altTag = /<meta\b[^>]*\b(?:property|name)="(?:og|twitter):image:alt"[^>]*>/g;
      if (altTag.test(text)) {
        text = text.replace(altTag, tag => tag.replace(/\bcontent="[^"]*"/, `content="${attr(ogAlt)}"`));
      } else {
        text = text.replace(ogTag, `${ogTag}\n<meta property="og:image:alt" content="${attr(ogAlt)}">`);
      }
    }
  }
  if (text !== before) { writeFileSync(file, text); files++; }
}

/* 3. Check: nothing still points at an old name, and every image referenced exists. */
const problems = [];
for (const file of walk(SITE).filter(f => TEXT.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const old of Object.keys(mapping)) {
    if (new RegExp(`(?<=[/"'(\\s,=])${escapeRe(old)}${WIDTH}\\.${IMG_EXT}`).test(text)) problems.push(`${relative(ROOT, file)} still references ${old}`);
  }
  for (const [, host, url] of text.matchAll(new RegExp(`(?<![\\w.-])(https?://[^/"'\\s]+)?((?:\\.{0,2}/)?(?:[\\w.-]+/)*[\\w.-]+\\.${IMG_EXT})(?=[\\s"'),?#]|$)`, 'g'))) {
    if (host && host !== ORIGIN) continue;            /* another site's picture */
    const local = url.startsWith('/') ? join(SITE, url) : join(dirname(file), url);
    if (!existsSync(local)) problems.push(`${relative(ROOT, file)} references missing ${url}`);
  }
}
if (problems.length) { console.error([...new Set(problems)].join('\n')); process.exit(1); }
console.log(`Renamed ${renamed} files; updated ${files} text files; every referenced image exists.`);
