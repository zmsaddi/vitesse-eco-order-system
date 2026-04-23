#!/usr/bin/env node
// Phase 5.5 — one-shot PWA icon generator.
// Reads public/icons/icon-source.svg → writes two PNGs:
//   - public/icons/icon-192.png  (standard)
//   - public/icons/icon-512-maskable.png  (maskable; has the "safe zone"
//     required by the PWA spec — 80% inner radius).
// Re-run this only when the source SVG changes; the PNGs are committed.
// No dependency added — `sharp` is resolvable transitively (Next.js's
// image pipeline already bundles it).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const svgPath = resolve(root, "public/icons/icon-source.svg");
const out192 = resolve(root, "public/icons/icon-192.png");
const out512 = resolve(root, "public/icons/icon-512-maskable.png");

const sharp = (await import("sharp")).default;
const svg = readFileSync(svgPath);

async function writePng(size, out) {
  const buf = await sharp(svg)
    .resize(size, size, { fit: "contain", background: "#111827" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${size}×${size}, ${buf.length} bytes)`);
}

await writePng(192, out192);
await writePng(512, out512);
