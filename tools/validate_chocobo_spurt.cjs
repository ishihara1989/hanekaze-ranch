'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const modulePaths = [process.env.NODE_PATH, process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
const { PNG } = require(require.resolve('pngjs', { paths: [__dirname, ...modulePaths] }));
const root = path.join(__dirname, '../public/assets/chocobo-sprite-study/v5/spurt');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const read = file => PNG.sync.read(fs.readFileSync(path.join(root, file)));
const bodyMask = read(manifest.masks.body), crestMask = read(manifest.masks.crest);
const bodies = Object.fromEntries(Object.entries(manifest.body).map(([key, entry]) => [key, read(entry.file)]));
const crests = Object.fromEntries(Object.entries(manifest.crest).map(([key, entry]) => [key, read(entry.file)]));
const report = { frames: manifest.frameCount, combinations: 60, width: manifest.width, height: manifest.height,
  alphaOverlap: 0, alphaMismatches: 0, fixedRegionMismatches: 0, colorPixels: {}, frameRegions: [] };
for (const image of [bodyMask, crestMask, ...Object.values(bodies), ...Object.values(crests)]) {
  assert.equal(image.width, manifest.width); assert.equal(image.height, manifest.height);
}
for (let frame = 0; frame < manifest.frameCount; frame++) {
  const regions = { frame: frame + 1, body: 0, crest: 0, fixed: 0 };
  for (let y = 0; y < manifest.cellHeight; y++) for (let x = 0; x < manifest.cellWidth; x++) {
    const offset = ((Math.floor(frame / 4) * 448 + y) * manifest.width + frame % 4 * 448 + x) * 4;
    const bodyAlpha = bodies.yellow.data[offset + 3], crestAlpha = crests.yellow.data[offset + 3];
    if (bodyAlpha && crestAlpha) report.alphaOverlap++;
    if (bodyMask.data[offset + 3]) regions.body++;
    else if (bodyAlpha) regions.fixed++;
    if (crestAlpha) regions.crest++;
    for (const [key, image] of Object.entries(bodies)) {
      if (image.data[offset + 3] !== bodyAlpha) report.alphaMismatches++;
      const differs = image.data.subarray(offset, offset + 3).some((v, channel) => v !== bodies.yellow.data[offset + channel]);
      if (differs && !bodyMask.data[offset + 3]) report.fixedRegionMismatches++;
      if (differs) report.colorPixels[key] = (report.colorPixels[key] || 0) + 1;
    }
    for (const image of Object.values(crests)) if (image.data[offset + 3] !== crestAlpha) report.alphaMismatches++;
    assert.equal(crestMask.data[offset + 3], crestAlpha);
  }
  assert.ok(regions.body > 10000 && regions.crest > 500 && regions.fixed > 1000, 'Each frame has feather, crest and fixed-color anatomy.');
  report.frameRegions.push(regions);
}
assert.equal(report.alphaOverlap, 0); assert.equal(report.alphaMismatches, 0); assert.equal(report.fixedRegionMismatches, 0);
for (const key of Object.keys(bodies).filter(key => key !== 'yellow')) assert.ok(report.colorPixels[key] > 10000);
const output = path.join(__dirname, '../output/imagegen'); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'sprite-spurt-v1-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
