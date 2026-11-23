// Builds extension/icons from src/app/icon.svg and packs extension/ into public/radar-extension.zip.
// Usage: node scripts/build-extension.mjs   (re-run after changing anything in extension/)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg");
mkdirSync("extension/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 72 * (size / 32) * 2 }).resize(size, size).png().toFile(`extension/icons/${size}.png`);
}

const { version } = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
rmSync("public/radar-extension.zip", { force: true });
execFileSync("zip", ["-qr", "../public/radar-extension.zip", ".", "-x", ".*"], { cwd: "extension" });
console.log(`Built public/radar-extension.zip (v${version})`);
