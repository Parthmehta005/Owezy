// Renders the Owezy icon set from one SVG design, using Playwright's browser.
// Run from web/: node scripts/make-icons.mjs   (writes into public/ and src/app/)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const TMP = "node_modules/.cache/owezy-icons";
mkdirSync(TMP, { recursive: true });
/** Where each generated file goes; anything not listed stays in the temp folder. */
const DEST = {
  "icon.svg": "src/app/icon.svg",
  "apple-icon.png": "src/app/apple-icon.png",
  "favicon.ico": "src/app/favicon.ico",
  "icon-192.png": "public/icon-192.png",
  "icon-512.png": "public/icon-512.png",
  "icon-maskable-512.png": "public/icon-maskable-512.png",
};
const out = (name) => DEST[name] ?? `${TMP}/${name}`;
const BG = "#4f39f6";
// A coin split in two: two half-discs pulled apart along a diagonal.
// Drawn on a 512 canvas around the centre; `scale` shrinks the mark for maskable safe zones.
const mark = (scale) => `
  <g transform="translate(256 256) scale(${scale}) rotate(-35)">
    <path d="M -14 -150 A 150 150 0 0 0 -14 150 Z" fill="#fff" transform="translate(-10 0)"/>
    <path d="M 14 -150 A 150 150 0 0 1 14 150 Z" fill="#fff" fill-opacity="0.72" transform="translate(10 0)"/>
  </g>`;
const svg = ({ rounded, scale }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${BG}"/>${mark(scale)}</svg>`;

const files = {
  "icon.svg": svg({ rounded: true, scale: 1 }), // favicon (app/icon.svg)
  "icon-192.png": [svg({ rounded: true, scale: 1 }), 192],
  "icon-512.png": [svg({ rounded: true, scale: 1 }), 512],
  "icon-maskable-512.png": [svg({ rounded: false, scale: 0.72 }), 512], // Android crops to a circle/squircle
  "apple-icon.png": [svg({ rounded: false, scale: 0.85 }), 180], // iOS rounds the corners itself
  "fav-32.png": [svg({ rounded: true, scale: 1.05 }), 32],
  "fav-16.png": [svg({ rounded: true, scale: 1.1 }), 16],
};
const b = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const p = await b.newPage();
const pngs = {};
for (const [name, v] of Object.entries(files)) {
  if (typeof v === "string") { writeFileSync(out(name), v); continue; }
  const [s, size] = v;
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  pngs[name] = await p.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(out(name), pngs[name]);
}
// favicon.ico holding the 16 and 32px PNGs.
const imgs = [[16, pngs["fav-16.png"]], [32, pngs["fav-32.png"]]];
const header = Buffer.alloc(6 + 16 * imgs.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(imgs.length, 4);
let offset = header.length;
imgs.forEach(([size, png], i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e); header.writeUInt8(size, e + 1); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png.length, e + 8); header.writeUInt32LE(offset, e + 12); offset += png.length;
});
writeFileSync(out("favicon.ico"), Buffer.concat([header, ...imgs.map(([, png]) => png)]));
// A preview sheet.
await p.setViewportSize({ width: 760, height: 260 });
await p.setContent(`<body style="margin:0;padding:20px;display:flex;gap:24px;align-items:center;background:#ddd">
  <img src="data:image/png;base64,${pngs["icon-512.png"].toString("base64")}" width=200>
  <img src="data:image/png;base64,${pngs["icon-maskable-512.png"].toString("base64")}" width=200 style="border-radius:50%">
  <img src="data:image/png;base64,${pngs["apple-icon.png"].toString("base64")}" width=180 style="border-radius:40px">
  <img src="data:image/png;base64,${pngs["fav-32.png"].toString("base64")}" width=32>
  <img src="data:image/png;base64,${pngs["fav-16.png"].toString("base64")}" width=16></body>`);
await p.screenshot({ path: `${TMP}/preview.png` });
await b.close();
console.log(`icons written; preview at ${TMP}/preview.png`);
