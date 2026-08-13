// Production build: minifies every CSS/JS file and writes a self-contained
// dist/ folder with HTML rewritten to point at the minified versions.
//
// The frontend/ source files are left completely untouched — keep
// developing and testing against them directly (open home.html, or serve
// the folder with `python3 -m http.server`, exactly as before). Run this
// script only when you're ready to deploy: `npm run build`, then upload
// the contents of dist/ to your static host.
//
// Usage:
//   npm install       (installs esbuild, one-time)
//   npm run build      (writes ./dist)

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

const JS_FILES = ["config.js", "analytics.js", "auth.js", "script.js", "admin.js"];
const CSS_FILES = ["styles.css"];
const HTML_FILES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const COPY_AS_IS = ["robots.txt", "sitemap.xml"];
const COPY_DIRS = ["assets"];

function formatBytes(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function build() {
  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  let totalBefore = 0;
  let totalAfter = 0;

  console.log("Minifying JS...");
  for (const file of JS_FILES) {
    const srcPath = path.join(ROOT, file);
    if (!fs.existsSync(srcPath)) continue; // admin.js only matters if present
    const src = fs.readFileSync(srcPath, "utf-8");
    const result = await esbuild.transform(src, { loader: "js", minify: true, target: "es2018" });
    const outName = file.replace(/\.js$/, ".min.js");
    fs.writeFileSync(path.join(DIST, outName), result.code);
    totalBefore += Buffer.byteLength(src);
    totalAfter += Buffer.byteLength(result.code);
    console.log(`  ${file} -> ${outName}  (${formatBytes(Buffer.byteLength(src))} -> ${formatBytes(Buffer.byteLength(result.code))})`);
  }

  console.log("Minifying CSS...");
  for (const file of CSS_FILES) {
    const srcPath = path.join(ROOT, file);
    const src = fs.readFileSync(srcPath, "utf-8");
    const result = await esbuild.transform(src, { loader: "css", minify: true });
    const outName = file.replace(/\.css$/, ".min.css");
    fs.writeFileSync(path.join(DIST, outName), result.code);
    totalBefore += Buffer.byteLength(src);
    totalAfter += Buffer.byteLength(result.code);
    console.log(`  ${file} -> ${outName}  (${formatBytes(Buffer.byteLength(src))} -> ${formatBytes(Buffer.byteLength(result.code))})`);
  }

  console.log("Rewriting HTML...");
  for (const file of HTML_FILES) {
    let html = fs.readFileSync(path.join(ROOT, file), "utf-8");
    for (const js of JS_FILES) {
      html = html.split(`src="${js}"`).join(`src="${js.replace(/\.js$/, ".min.js")}"`);
    }
    for (const css of CSS_FILES) {
      html = html.split(`href="${css}"`).join(`href="${css.replace(/\.css$/, ".min.css")}"`);
    }
    fs.writeFileSync(path.join(DIST, file), html);
  }

  console.log("Copying static files...");
  for (const file of COPY_AS_IS) {
    const p = path.join(ROOT, file);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, file));
  }
  for (const dir of COPY_DIRS) {
    const p = path.join(ROOT, dir);
    if (fs.existsSync(p)) copyDir(p, path.join(DIST, dir));
  }

  console.log(`\nDone. dist/ is ready to deploy.`);
  console.log(`JS+CSS: ${formatBytes(totalBefore)} -> ${formatBytes(totalAfter)} (${Math.round((1 - totalAfter / totalBefore) * 100)}% smaller)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
