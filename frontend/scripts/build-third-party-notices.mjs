import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const sections = ['Third-party production dependency notices for Plotmio.\nGenerated from package-lock.json and installed package license files.\nDependency licenses apply independently of the project license.'];
const seen = new Set();
const missing = [];
const upstreamFiles = {
  '@uiw/codemirror-extensions-basic-setup@4.23.10': 'react-codemirror.txt',
  '@uiw/react-codemirror@4.23.10': 'react-codemirror.txt',
  'html-parse-stringify@3.0.1': 'html-parse-stringify.txt',
};
for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!location || entry.dev) continue;
  const directory = path.join(root, location);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const id = `${metadata.name}@${metadata.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const files = fs.readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(name)
    && fs.statSync(path.join(directory, name)).isFile()).sort();
  let licenseText = files.map(name => `\n--- ${name} ---\n${fs.readFileSync(path.join(directory, name), 'utf8').replace(/\r\n/g, '\n').trim()}`).join('\n');
  if (!files.some(name => /^(licen[cs]e|copying)/i.test(name))) {
    if (upstreamFiles[id]) {
      licenseText += fs.readFileSync(path.join(root, 'licenses', upstreamFiles[id]), 'utf8').replace(/\r\n/g, '\n');
    } else {
      const readmePath = path.join(directory, 'README.md');
      const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n') : '';
      const markers = ['(The MIT License)', 'This is free and unencumbered software released into the public domain.'];
      const index = markers.map(marker => readme.indexOf(marker)).find(value => value >= 0);
      if (index !== undefined) licenseText += readme.slice(index).trim();
      else missing.push(id);
    }
  }
  sections.push(`\n${'='.repeat(72)}\n${id}\nLicense: ${metadata.license}\n${licenseText}`);
}
if (missing.length) throw new Error(`Missing dependency license texts: ${missing.join(', ')}`);
const output = path.join(root, 'public', 'THIRD_PARTY_NOTICES.txt');
fs.writeFileSync(output, sections.join('\n') + '\n');
console.log(`Generated notices for ${seen.size} dependency versions`);
