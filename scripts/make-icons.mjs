// Membuat ikon PWA dari SVG. Jalankan: node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#1e3a8a"/>
  <g transform="translate(256 256) scale(${pad ? 0.72 : 1}) translate(-256 -256)">
    <path d="M256 120 L436 200 L256 280 L76 200 Z" fill="#ffffff"/>
    <path d="M150 238 V320 C150 352 200 380 256 380 C312 380 362 352 362 320 V238 L256 286 Z" fill="#93c5fd"/>
    <rect x="404" y="206" width="16" height="96" rx="8" fill="#facc15"/>
    <circle cx="412" cy="312" r="18" fill="#facc15"/>
  </g>
</svg>`;

const out = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
for (const [name, size, pad] of out) {
  const buf = await sharp(Buffer.from(svg(pad))).resize(size, size).png().toBuffer();
  writeFileSync(`public/icons/${name}`, buf);
  console.log("wrote", name);
}
writeFileSync("src/app/icon.svg", svg(false).trim());
