import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distAssetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const maxLargestJsBytes = 6_000_000;

const jsAssets = readdirSync(distAssetsDir)
  .filter((filename) => filename.endsWith('.js'))
  .map((filename) => {
    const path = join(distAssetsDir, filename);
    return {
      filename,
      bytes: statSync(path).size,
    };
  })
  .sort((a, b) => b.bytes - a.bytes);

if (jsAssets.length === 0) {
  throw new Error('MVP bundle check failed: no JS assets found in dist/assets. Run npm run build first.');
}

const largest = jsAssets[0];
if (largest.bytes > maxLargestJsBytes) {
  throw new Error(
    `MVP bundle check failed: largest JS chunk ${largest.filename} is ${largest.bytes} bytes, ` +
      `over the MVP budget ${maxLargestJsBytes} bytes.`,
  );
}

console.log(
  `MVP bundle check passed: largest JS chunk ${largest.filename} is ${largest.bytes} bytes ` +
    `(budget ${maxLargestJsBytes} bytes).`,
);
