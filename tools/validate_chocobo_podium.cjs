'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const modulePaths = [process.env.NODE_PATH, process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
const { PNG } = require(require.resolve('pngjs', { paths: [__dirname, ...modulePaths] }));
const root = path.join(__dirname, '../public/assets/chocobo-sprite-study/v5/podium');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const read = file => PNG.sync.read(fs.readFileSync(path.join(root, file)));
const mask = read(m.masks.body), crestMask = read(m.masks.crest),
  bodies = Object.fromEntries(Object.entries(m.body).map(([key, entry]) => [key, read(entry.file)])),
  crests = Object.fromEntries(Object.entries(m.crest).map(([key, entry]) => [key, read(entry.file)]));
const report = { frames: m.frameCount, combinations: Object.keys(bodies).length * Object.keys(crests).length,
  width: m.width, height: m.height, alphaOverlap: 0, alphaMismatches: 0, fixedRegionMismatches: 0, mirrorMismatches: 0, colorPixels: {}, frameRegions: [] };
assert.equal(report.combinations, 60); assert.equal(report.frames, 8);
for (const image of [mask, crestMask, ...Object.values(bodies), ...Object.values(crests)]) {
  assert.equal(image.width, m.width); assert.equal(image.height, m.height);
  for (let f = 0; f < 4; f++) for (let y = 0; y < m.cellHeight; y++) for (let x = 0; x < m.cellWidth; x++) {
    const a = (y * m.width + f * m.cellWidth + x) * 4,
      b = ((y + m.cellHeight) * m.width + f * m.cellWidth + m.cellWidth - 1 - x) * 4;
    for (let c = 0; c < 4; c++) if (image.data[a + c] !== image.data[b + c]) report.mirrorMismatches++;
  }
}
for (let frame = 0; frame < m.frameCount; frame++) {
  const regions = { frame: frame + 1, body: 0, crest: 0, fixed: 0, baseline: 0, minX: m.cellWidth, maxX: 0, minY: m.cellHeight };
  for (let y = 0; y < m.cellHeight; y++) for (let x = 0; x < m.cellWidth; x++) {
    const offset = ((Math.floor(frame / m.columns) * m.cellHeight + y) * m.width + frame % m.columns * m.cellWidth + x) * 4,
      bodyAlpha = bodies.yellow.data[offset + 3], crestAlpha = crests.yellow.data[offset + 3];
    if (bodyAlpha && crestAlpha) report.alphaOverlap++;
    if (mask.data[offset + 3]) regions.body++; else if (bodyAlpha) regions.fixed++;
    if (crestAlpha) regions.crest++;
    if (bodyAlpha >= 96 || crestAlpha >= 96) {
      regions.baseline = Math.max(regions.baseline, y); regions.minY = Math.min(regions.minY, y);
      regions.minX = Math.min(regions.minX, x); regions.maxX = Math.max(regions.maxX, x);
    }
    for (const [key, image] of Object.entries(bodies)) {
      if (image.data[offset + 3] !== bodyAlpha) report.alphaMismatches++;
      const differs = image.data.subarray(offset, offset + 3).some((value, c) => value !== bodies.yellow.data[offset + c]);
      if (differs && !mask.data[offset + 3]) report.fixedRegionMismatches++;
      if (differs) report.colorPixels[key] = (report.colorPixels[key] || 0) + 1;
    }
    for (const image of Object.values(crests)) if (image.data[offset + 3] !== crestAlpha) report.alphaMismatches++;
    assert.equal(crestMask.data[offset + 3], crestAlpha);
  }
  assert.ok(regions.body > 10000 && regions.crest > 500 && regions.fixed > 1000, 'Every frame needs plumage, forehead crest and fixed anatomy.');
  assert.ok(Math.abs(regions.baseline - m.anchor.y * m.cellHeight) <= 2, 'Planted feet must stay on the shared baseline.');
  assert.ok(regions.minX >= 12 && regions.maxX < m.cellWidth - 12 && regions.minY >= 12, 'Wings and crest need transparent margins.');
  report.frameRegions.push(regions);
}
assert.equal(report.alphaOverlap, 0); assert.equal(report.alphaMismatches, 0);
assert.equal(report.fixedRegionMismatches, 0); assert.equal(report.mirrorMismatches, 0);
for (const key of Object.keys(bodies).filter(key => key !== 'yellow')) assert.ok(report.colorPixels[key] > 10000);
const output = path.join(__dirname, '../output/imagegen'); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'sprite-podium-v1-validation.json'), JSON.stringify(report, null, 2) + '\n');
// A registered idle / right / left contact sheet, using the delivered layers.
const preview = new PNG({ width: m.cellWidth * 3, height: m.cellHeight });
for (const [column, frame] of [0, 2, 6].entries()) for (let y = 0; y < m.cellHeight; y++) for (let x = 0; x < m.cellWidth; x++) {
  const src = ((Math.floor(frame / m.columns) * m.cellHeight + y) * m.width + frame % m.columns * m.cellWidth + x) * 4,
    dst = (y * preview.width + column * m.cellWidth + x) * 4,
    image = crests.yellow.data[src + 3] ? crests.yellow : bodies.yellow;
  image.data.copy(preview.data, dst, src, src + 4);
}
fs.writeFileSync(path.join(root, 'preview-poses.png'), PNG.sync.write(preview));
console.log(JSON.stringify(report, null, 2));
