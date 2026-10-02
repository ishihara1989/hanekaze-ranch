/* Build reusable body and crest layers from the corrected art and its semantic mask. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Genetics = require('../public/js/ranch-genetics.js');
const palette = require('../public/assets/chocobo-v3/manifest.json');
const modulePaths = [process.env.NODE_PATH, process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
const { PNG } = require(require.resolve('pngjs', { paths: [__dirname, ...modulePaths] }));
const root = path.join(__dirname, '../public/assets/chocobo-sprite-study');
const revision = Number(process.argv[2] || 5);
if (![2, 3, 4, 5].includes(revision)) throw new Error('Supported sprite revisions: 2, 3, 4, 5.');
const destination = path.join(root, 'v' + revision);
const sourceRevision = revision === 5 ? 4 : revision;
const source = PNG.sync.read(fs.readFileSync(path.join(root, 'run-yellow-v' + sourceRevision + '.png')));
const semantic = PNG.sync.read(fs.readFileSync(path.join(root, 'regions-v' + sourceRevision + '.png')));
const metallic = revision === 5 ? PNG.sync.read(fs.readFileSync(path.join(root, 'run-golden-metallic-v1.png'))) : null;
if (source.width !== semantic.width || source.height !== semantic.height) throw new Error('The art and semantic mask must have identical dimensions.');
if (metallic && (source.width !== metallic.width || source.height !== metallic.height)) throw new Error('The metallic material must align with the finalized motion source.');
const cell = 448, width = cell * 4, height = cell * 2;
const colors = Object.keys(Genetics.COLORS), crests = Object.keys(Genetics.CRESTS);
const rgb = hex => hex.replace('#', '').match(/../g).map(part => parseInt(part, 16));
const mix = (a, b, t) => a.map((value, channel) => Math.round(value + (b[channel] - value) * Math.max(0, Math.min(1, t))));
const luminance = pixel => (.2126 * pixel[0] + .7152 * pixel[1] + .0722 * pixel[2]) / 255;
function ramp(light, color) {
  const main = rgb(color.main), dark = rgb(color.dark), pale = rgb(color.light);
  const points = [[0, [9, 10, 12]], [.16, mix(dark, [12, 13, 15], .65)], [.41, dark], [.73, main], [.87, pale], [1, mix(pale, [255, 255, 255], .38)]];
  for (let index = 1; index < points.length; index++) if (light <= points[index][0]) return mix(points[index - 1][1], points[index][1], (light - points[index - 1][0]) / (points[index][0] - points[index - 1][0]));
  return points.at(-1)[1];
}
function crestPalette(key, x, bounds) {
  const color = key === 'rainbow' ? (() => {
    const stops = palette.crests.rainbow.map(rgb);
    const position = Math.max(0, Math.min(1, (bounds.maxX - x) / Math.max(1, bounds.maxX - bounds.minX))) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(position));
    return mix(stops[index], stops[index + 1], position - index);
  })() : rgb(palette.crests[key]);
  return { main: '#' + color.map(value => value.toString(16).padStart(2, '0')).join(''), dark: '#' + mix(color, [24, 18, 27], .48).map(value => value.toString(16).padStart(2, '0')).join(''), light: '#' + mix(color, [255, 255, 255], .38).map(value => value.toString(16).padStart(2, '0')).join('') };
}
// 0: unmodified beak/eye/bare leg, 1: body plumage, 2: independently colored crest.
const classes = new Uint8Array(source.width * source.height);
for (let index = 0; index < classes.length; index++) {
  const offset = index * 4, r = semantic.data[offset], g = semantic.data[offset + 1], b = semantic.data[offset + 2];
  if (semantic.data[offset + 3] < 32) continue;
  if (b > 75 && g > 75 && g > r * 1.3) classes[index] = 1;
  else if (b > 75 && r > 75 && r > g * 1.3) classes[index] = 2;
}
// Carry the nearest semantic classification onto a few original antialiased edge pixels.
const originalClasses = classes.slice();
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  const index = y * source.width + x, offset = index * 4;
  if (classes[index] || source.data[offset + 3] < 16 || semantic.data[offset + 3] >= 32) continue;
  let found = false;
  for (let radius = 1; radius <= 3 && !found; radius++) for (let dy = -radius; dy <= radius && !found; dy++) for (let dx = -radius; dx <= radius && !found; dx++) {
    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
    const neighbor = ny * source.width + nx;
    if (semantic.data[neighbor * 4 + 3] >= 96) { classes[index] = originalClasses[neighbor]; found = true; }
  }
}
const frames = Array.from({ length: 8 }, (_, frame) => {
  const column = frame % 4, row = Math.floor(frame / 4);
  const x = Math.round(column * source.width / 4), y = Math.round(row * source.height / 2);
  const w = Math.round((column + 1) * source.width / 4) - x, h = Math.round((row + 1) * source.height / 2) - y;
  const bounds = { minX: w, maxX: 0 };
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) if (classes[(y + sy) * source.width + x + sx] === 2 && source.data[((y + sy) * source.width + x + sx) * 4 + 3] >= 100) { bounds.minX = Math.min(bounds.minX, sx); bounds.maxX = Math.max(bounds.maxX, sx); }
  if (bounds.maxX <= bounds.minX) throw new Error('A frame is missing its crest region: ' + frame);
  return { x, y, w, h, dx: column * cell + Math.floor((cell - w) / 2), dy: row * cell + Math.floor((cell - h) / 2), bounds };
});
function make(kind, key) {
  const image = new PNG({ width, height });
  for (const frame of frames) for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
    const sourceIndex = (frame.y + y) * source.width + frame.x + x, sourceOffset = sourceIndex * 4;
    const offset = ((frame.dy + y) * width + frame.dx + x) * 4, region = classes[sourceIndex], alpha = source.data[sourceOffset + 3];
    if (alpha < 16 || !region && semantic.data[sourceOffset + 3] < 32) continue;
    if (kind === 'body' && region === 2 || kind === 'crest' && region !== 2 || kind === 'body-mask' && region !== 1 || kind === 'crest-mask' && region !== 2) continue;
    let pixel = Array.from(source.data.subarray(sourceOffset, sourceOffset + 3));
    if (kind.endsWith('-mask')) pixel = [255, 255, 255];
    else if (kind === 'body' && region === 1 && key !== 'yellow') {
      // Take only the generated material RGB; finalized motion alpha and all other regions stay unchanged.
      pixel = key === 'golden' && metallic && metallic.data[sourceOffset + 3] >= 96
        ? Array.from(metallic.data.subarray(sourceOffset, sourceOffset + 3))
        : ramp(luminance(pixel), palette.palette[key]);
    }
    else if (kind === 'crest' && key !== 'yellow') pixel = ramp(luminance(pixel), crestPalette(key, x, frame.bounds));
    image.data.set([...pixel, alpha], offset);
  }
  return image;
}
fs.mkdirSync(destination, { recursive: true });
const save = (name, image) => fs.writeFileSync(path.join(destination, name), PNG.sync.write(image));
for (const key of colors) save('body-' + key + '.png', make('body', key));
for (const key of crests) save('crest-' + key + '.png', make('crest', key));
save('body-mask.png', make('body-mask'));
save('crest-mask.png', make('crest-mask'));
const phases = revision === 2 ? ['右脚が前で着地', '右脚が体の下で荷重', '右脚で後方へ蹴る', '浮遊・左脚を前へ', '左脚が前で着地', '左脚が体の下で荷重', '左脚で後方へ蹴る', '浮遊・右脚を前へ'] : ['奥の暗い脚が前で着地', '奥の脚が体の下で荷重', '奥の脚で後方へ蹴る', '浮遊・手前の太ももと脚を前へ', '手前の明るい脚が前で着地', '手前の脚が体の下で荷重', '手前の脚で後方へ蹴る', '浮遊・手前の太ももと脚を後ろへ'];
const manifest = { revision, columns: 4, rows: 2, cellWidth: cell, cellHeight: cell, width, height, frameCount: 8, recommendedFps: 10, source: '../run-yellow-v' + sourceRevision + '.png', semanticMask: '../regions-v' + sourceRevision + '.png', metallicSource: metallic ? '../run-golden-metallic-v1.png' : undefined, body: Object.fromEntries(colors.map(key => [key, { label: Genetics.COLORS[key], file: 'body-' + key + '.png' }])), crest: Object.fromEntries(crests.map(key => [key, { label: Genetics.CRESTS[key], file: 'crest-' + key + '.png' }])), masks: { body: 'body-mask.png', crest: 'crest-mask.png' }, phases, visibleNearLeg: revision === 2 ? 'left' : 'right', visibleFarLeg: revision === 2 ? 'right' : 'left', thighCoupling: revision >= 3 ? 'Each bright near / shaded far feathered thigh connects to and follows its own orange / brown lower leg.' : undefined, compositing: 'Draw body then crest at identical coordinates. Layers have disjoint nonzero-alpha pixels.' };
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built 10 body sheets + 6 crest sheets + 2 region masks; 60 combinations, ' + width + 'x' + height + ', 448px cells.');
