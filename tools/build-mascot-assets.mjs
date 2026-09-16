// macOS packaging utility: format/size derivatives only; originals stay unchanged.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await readFile(join(root, 'resources/mascot-catalog.json'), 'utf8'));
const branding = join(root, 'resources/branding');
const iconset = join(branding, 'icon.iconset');
const thumbnails = join(root, 'web/src/assets/mascots');
await mkdir(iconset, { recursive: true });
await mkdir(thumbnails, { recursive: true });
const resize = (source, size, destination) => execFileSync('sips', ['-z', String(size), String(size), source, '--out', destination], { stdio: 'ignore' });
for (const item of catalog) resize(join(root, 'resources/mascots', item.id + '.png'), 256, join(thumbnails, item.id + '.png'));
const source = join(branding, 'icon.png');
execFileSync('swift', [join(root, 'tools/mask-macos-icon.swift'), join(root, 'resources/mascots/owl-c1.png'), source], { stdio: 'inherit' });
for (const size of [16, 32, 128, 256, 512]) {
  resize(source, size, join(iconset, `icon_${size}x${size}.png`));
  resize(source, size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(branding, 'icon.icns')]);
const sizes = [16, 32, 48, 64, 128, 256];
const payloads = [];
for (const size of sizes) {
  const destination = join(branding, `windows-${size}.png`);
  resize(source, size, destination);
  payloads.push(await readFile(destination));
}
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const index = 6 + i * 16;
  header[index] = header[index + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, index + 4); header.writeUInt16LE(32, index + 6);
  header.writeUInt32LE(payloads[i].length, index + 8); header.writeUInt32LE(offset, index + 12);
  offset += payloads[i].length;
});
await writeFile(join(branding, 'icon.ico'), Buffer.concat([header, ...payloads]));
console.log('Prepared six 256px avatars, 1024px application PNG, macOS ICNS and Windows ICO.');
