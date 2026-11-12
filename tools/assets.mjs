// Bootstrap 6 for a built site: the menu drawer's script, and Bootstrap's CSS
// trimmed to the classes the pages and scripts use.
//
// Usage (from tools/): npm install, then node assets.mjs ../site [--full]
//   writes <site_dir>/js/bootstrap.min.js   Bootstrap's Drawer plugin (it brings
//                                           its dialog base and data API), one
//                                           classic script, no globals
//          <site_dir>/css/bootstrap.min.css Bootstrap's own compiled CSS, run
//                                           through PurgeCSS against the pages
//                                           and site/js, then minified
// --full skips the trimming (for comparing against the full framework).
//
// Run from a folder where `bootstrap`, `purgecss` and `esbuild` are installed
// (the repo's package.json lists them; `npm install` there).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const [siteDir, flag] = process.argv.slice(2);
const require = createRequire(path.join(process.cwd(), 'package.json'));
const esbuild = require('esbuild');
const { PurgeCSS } = require('purgecss');
// Bootstrap 6 exports only its dist and js paths, not package.json.
const bsRoot = path.resolve(path.dirname(require.resolve('bootstrap/dist/css/bootstrap.css')), '..', '..');
const bsVersion = JSON.parse(fs.readFileSync(path.join(bsRoot, 'package.json'), 'utf8')).version;

// 1. Script: the Drawer plugin registers its own data API on import
//    (data-bs-toggle="drawer", data-bs-dismiss="drawer").
const entry = path.join(process.cwd(), '.bs-entry.js');
fs.writeFileSync(entry, "import 'bootstrap/js/dist/drawer.js';\n");
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  legalComments: 'eof',
  outfile: path.join(siteDir, 'js', 'bootstrap.min.js'),
  logLevel: 'error',
});
fs.unlinkSync(entry);

// 2. CSS.
const full = fs.readFileSync(path.join(bsRoot, 'dist', 'css', 'bootstrap.css'), 'utf8');
let css = full;
if (flag !== '--full') {
  // Every page, including pages kept in folders (about/index.html).
  const htmlFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
  const content = [
    ...htmlFiles(siteDir),
    ...fs.readdirSync(path.join(siteDir, 'js')).filter(f => f.endsWith('.js') && f !== 'bootstrap.min.js').map(f => path.join(siteDir, 'js', f)),
  ];
  const [res] = await new PurgeCSS().purge({
    content,
    css: [{ raw: full }],
    // Bootstrap 6 class names carry a breakpoint prefix (lg:col-6).
    defaultExtractor: c => c.match(/[\w\-:./]+(?<!:)/g) || [],
    variables: true,
    keyframes: true,
    safelist: {
      // Set by the drawer and dialog scripts at run time.
      standard: ['show', 'showing', 'hiding', 'dialog-open', 'dialog-static', 'drawer-static', 'pointer-event', 'open'],
      greedy: [/\[open\]/, /:modal/, /::backdrop/],
    },
  });
  css = res.css;
}
const banner = `/*! Bootstrap v${bsVersion} (https://getbootstrap.com/), MIT licence. ${flag === '--full' ? 'Full build.' : 'Trimmed to the classes this site uses (PurgeCSS); rebuild with tools/assets.mjs after adding new Bootstrap classes.'} */\n`;
const out = await esbuild.transform(css, { loader: 'css', minify: true, legalComments: 'none' });
fs.writeFileSync(path.join(siteDir, 'css', 'bootstrap.min.css'), banner + out.code);
const kb = f => (fs.statSync(path.join(siteDir, f)).size / 1024).toFixed(1) + ' KB';
console.log(`bootstrap ${bsVersion}: css/bootstrap.min.css ${kb('css/bootstrap.min.css')}, js/bootstrap.min.js ${kb('js/bootstrap.min.js')}`);
