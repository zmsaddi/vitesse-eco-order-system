#!/usr/bin/env node
// Phase 5.5 — CI hardening: verify .nvmrc major === engines.node minimum major.
// Fails fast if the two drift apart. Does NOT bump Node: both files are
// authoritative; this script only catches inconsistencies.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const nvmrc = readFileSync(resolve(root, ".nvmrc"), "utf8").trim();
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const engines = pkg?.engines?.node ?? "";

const nvmrcMajor = /^(\d+)/.exec(nvmrc)?.[1];
const enginesMajor = /\d+/.exec(engines)?.[0];

if (!nvmrcMajor) {
  console.error(`.nvmrc has no leading major: ${JSON.stringify(nvmrc)}`);
  process.exit(1);
}
if (!enginesMajor) {
  console.error(`package.json engines.node has no major: ${JSON.stringify(engines)}`);
  process.exit(1);
}
if (nvmrcMajor !== enginesMajor) {
  console.error(
    `drift: .nvmrc major=${nvmrcMajor}, package.json engines.node major=${enginesMajor}`,
  );
  process.exit(1);
}

console.log(`ok — Node major ${nvmrcMajor} in both .nvmrc and engines.node`);
