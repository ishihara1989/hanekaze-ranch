/* Pack generated podium keyframes, keeping body/crest registered and mirroring both layers. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const Genetics = require('../public/js/ranch-genetics.js');
const palette = require('../public/assets/chocobo-sprite-study/palette.json');
const modulePaths = [process.env.NODE_PATH, process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
const { PNG } = require(require.resolve('pngjs', { paths: [__dirname, ...modulePaths] }));
const sharp = require(require.resolve('sharp', { paths: [__dirname, ...modulePaths] }));
const root = path.join(__dirname, '../public/assets/chocobo-sprite-study');
const destination = path.join(root, 'v5/podium');
const sourceName = 'podium-yellow-v1.png', semanticName = 'regions-podium-v1.png', metallicName = 'podium-golden-metallic-v1.png';
const read = file => PNG.sync.read(fs.readFileSync(path.join(root, file)));
const source = read(sourceName), semantic = read(semanticName), metallic = read(metallicName);
for (const image of [semantic, metallic]) if (image.width !== source.width || image.height !== source.height) throw Error('Podium source layers must have identical dimensions.');
const cell = 448, columns = 4, rows = 2, width = cell * columns, height = cell * rows, baseline = 420;
const colors = Object.keys(Genetics.COLORS), crests = Object.keys(Genetics.CRESTS);
const rgb = hex => hex.replace('#', '').match(/../g).map(part => parseInt(part, 16));
const mix = (a, b, t) => a.map((value, channel) => Math.round(value + (b[channel] - value) * Math.max(0, Math.min(1, t))));
const luminance = pixel => (.2126 * pixel[0] + .7152 * pixel[1] + .0722 * pixel[2]) / 255;
function ramp(light, color) {
  const main = rgb(color.main), dark = rgb(color.dark), pale = rgb(color.light);
  const points = [[0, [9, 10, 12]], [.16, mix(dark, [12, 13, 15], .65)], [.41, dark], [.73, main], [.87, pale], [1, mix(pale, [255, 255, 255], .38)]];
  for (let i = 1; i < points.length; i++) if (light <= points[i][0]) return mix(points[i - 1][1], points[i][1], (light - points[i - 1][0]) / (points[i][0] - points[i - 1][0]));
  return points.at(-1)[1];
}
function crestPalette(key, x, bounds) {
  const color = key === 'rainbow' ? (() => {
    const stops = palette.crests.rainbow.map(rgb), position = Math.max(0, Math.min(1, (bounds.maxX - x) / Math.max(1, bounds.maxX - bounds.minX))) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(position));
    return mix(stops[i], stops[i + 1], position - i);
  })() : rgb(palette.crests[key]);
  const hex = values => '#' + values.map(value => value.toString(16).padStart(2, '0')).join('');
  return { main: hex(color), dark: hex(mix(color, [24, 18, 27], .48)), light: hex(mix(color, [255, 255, 255], .38)) };
}
// Find full connected birds before slicing: a raised wing may cross the generated grid.
// This preserves its tip while rejecting detached generation speckles.
function components() {
  const visited = new Uint8Array(source.width * source.height), queue = new Int32Array(visited.length), birds = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || source.data[start * 4 + 3] < 16) continue;
    let head = 0, tail = 1; queue[0] = start; visited[start] = 1;
    const bounds = { minX: source.width, minY: source.height, maxX: 0, maxY: 0 };
    while (head < tail) {
      const index = queue[head++], x = index % source.width, y = Math.floor(index / source.width);
      bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, next = ny * source.width + nx;
        if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height || visited[next] || source.data[next * 4 + 3] < 16) continue;
        visited[next] = 1; queue[tail++] = next;
      }
    }
    if (tail > 10000) birds.push({ ...bounds, pixels: Array.from(queue.subarray(0, tail)) });
  }
  if (birds.length !== 4) throw Error('Expected four isolated podium keyframes; found ' + birds.length);
  birds.sort((a, b) => Math.floor(a.minY / (source.height / 2)) - Math.floor(b.minY / (source.height / 2)) || a.minX - b.minX);
  return birds.map(bird => {
    bird.w = bird.maxX - bird.minX + 1; bird.h = bird.maxY - bird.minY + 1;
    const feet = bird.pixels.filter(i => Math.floor(i / source.width) > bird.maxY - bird.h * .12 && source.data[i * 4 + 3] >= 96);
    if (!feet.length) throw Error('A podium keyframe is missing planted feet.');
    let min = source.width, max = 0;
    for (const i of feet) { min = Math.min(min, i % source.width); max = Math.max(max, i % source.width); }
    bird.footCenter = (min + max) / 2;
    return bird;
  });
}
async function build() {
  const birds = components();
  const scale = Math.min(396 / Math.max(...birds.map(b => b.h)), 204 / Math.max(...birds.map(b => Math.max(b.footCenter - b.minX, b.maxX - b.footCenter))));
  const frames = [];
  for (const bird of birds) {
    const w = Math.round(bird.w * scale), h = Math.round(bird.h * scale);
    const crop = image => {
      const data = Buffer.alloc(bird.w * bird.h * 4);
      for (const index of bird.pixels) {
        const offset = ((Math.floor(index / source.width) - bird.minY) * bird.w + index % source.width - bird.minX) * 4;
        image.data.copy(data, offset, index * 4, index * 4 + 4);
      }
      return data;
    };
    const resize = (image, kernel) => sharp(crop(image), { raw: { width: bird.w, height: bird.h, channels: 4 } }).resize(w, h, { kernel }).raw().toBuffer();
    const [art, mask, gold] = await Promise.all([resize(source, sharp.kernel.lanczos3), resize(semantic, sharp.kernel.nearest), resize(metallic, sharp.kernel.lanczos3)]);
    const classes = new Uint8Array(w * h), bounds = { minX: w, maxX: 0 };
    for (let i = 0; i < classes.length; i++) {
      const o = i * 4, r = mask[o], g = mask[o + 1], b = mask[o + 2];
      if (mask[o + 3] >= 32) {
        if (b > 75 && g > 75 && g > r * 1.3) classes[i] = 1;
        else if (b > 75 && r > 75 && r > g * 1.3) classes[i] = 2;
      }
    }
    // Carry the nearest class onto antialiased original edge pixels.
    const original = classes.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      if (classes[i] || art[o + 3] < 16 || mask[o + 3] >= 32) continue;
      let found = false;
      for (let radius = 1; radius <= 3 && !found; radius++) for (let dy = -radius; dy <= radius && !found; dy++) for (let dx = -radius; dx <= radius && !found; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (mask[next * 4 + 3] >= 96) { classes[i] = original[next]; found = true; }
      }
    }
    for (let i = 0; i < classes.length; i++) if (classes[i] === 2 && art[i * 4 + 3] >= 96) { bounds.minX = Math.min(bounds.minX, i % w); bounds.maxX = Math.max(bounds.maxX, i % w); }
    if (bounds.maxX <= bounds.minX) throw Error('A podium keyframe is missing its forehead crest.');
    frames.push({ w, h, art, gold, classes, bounds, dx: Math.round(cell / 2 - (bird.footCenter - bird.minX) * w / bird.w), dy: baseline - h + 1 });
  }
  function make(kind, key) {
    const image = new PNG({ width, height });
    for (const [f, frame] of frames.entries()) for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
      const i = y * frame.w + x, o = i * 4, region = frame.classes[i], alpha = frame.art[o + 3];
      if (alpha < 16 || kind === 'body' && region === 2 || kind === 'crest' && region !== 2 || kind === 'body-mask' && region !== 1 || kind === 'crest-mask' && region !== 2) continue;
      let pixel = Array.from(frame.art.subarray(o, o + 3));
      if (kind.endsWith('-mask')) pixel = [255, 255, 255];
      else if (kind === 'body' && region === 1 && key !== 'yellow') pixel = key === 'golden' && frame.gold[o + 3] >= 96 ? Array.from(frame.gold.subarray(o, o + 3)) : ramp(luminance(pixel), palette.palette[key]);
      else if (kind === 'crest' && key !== 'yellow') pixel = ramp(luminance(pixel), crestPalette(key, x, frame.bounds));
      const px = frame.dx + x, py = frame.dy + y;
      if (px < 0 || px >= cell || py < 0 || py >= cell) throw Error('A podium keyframe would be clipped.');
      // Recolor once, then mirror the exact finished RGBA pixel for the left gesture.
      for (const mirrored of [false, true]) {
        const offset = (((mirrored ? cell : 0) + py) * width + f * cell + (mirrored ? cell - 1 - px : px)) * 4;
        image.data.set([...pixel, alpha], offset);
      }
    }
    return image;
  }
  fs.mkdirSync(destination, { recursive: true });
  const save = (name, image) => fs.writeFileSync(path.join(destination, name), PNG.sync.write(image));
  for (const key of colors) save('body-' + key + '.png', make('body', key));
  for (const key of crests) save('crest-' + key + '.png', make('crest', key));
  save('body-mask.png', make('body-mask')); save('crest-mask.png', make('crest-mask'));
  const manifest = { revision: 5, motion: 'podium', label: '表彰・声援への挨拶', columns, rows, cellWidth: cell, cellHeight: cell, width, height, frameCount: 8, recommendedFps: 5,
    frameSequence: [0, 0, 0, 1, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 6, 7],
    source: '../../' + sourceName, semanticMask: '../../' + semanticName, metallicSource: '../../' + metallicName,
    body: Object.fromEntries(colors.map(key => [key, { label: Genetics.COLORS[key], file: 'body-' + key + '.png' }])),
    crest: Object.fromEntries(crests.map(key => [key, { label: Genetics.CRESTS[key], file: 'crest-' + key + '.png' }])),
    masks: { body: 'body-mask.png', crest: 'crest-mask.png' }, anchor: { x: .5, y: baseline / cell }, crestCrop: { x: 126, y: 12, width: 202, height: 116 },
    phases: ['正面で待機', 'やや右を向き、くちばしを少し開いて右羽を上げる', '右羽を上げて声援に応える', '右羽を下ろして正面へ戻る', '正面で待機（左右反転）', 'やや左を向き、くちばしを少し開いて左羽を上げる', '左羽を上げて声援に応える', '左羽を下ろして正面へ戻る'],
    mirroring: 'Frames 5–8 are exact horizontal RGBA mirrors of frames 1–4 for every layer. Right/left refer to screen direction.',
    compositing: 'Draw body then crest at identical coordinates. Layers have disjoint nonzero-alpha pixels. Use frameSequence at recommendedFps to hold idle and greeting poses.' };
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const mainPath = path.join(root, 'v5/manifest.json'), main = JSON.parse(fs.readFileSync(mainPath, 'utf8')), entry = { ...manifest };
  for (const kind of ['body', 'crest']) entry[kind] = Object.fromEntries(Object.entries(manifest[kind]).map(([key, value]) => [key, { ...value, file: 'podium/' + value.file }]));
  for (const key of ['source', 'semanticMask', 'metallicSource']) entry[key] = path.posix.normalize('podium/' + manifest[key]);
  entry.masks = Object.fromEntries(Object.entries(manifest.masks).map(([key, file]) => [key, 'podium/' + file]));
  main.motions = { ...main.motions, podium: entry };
  fs.writeFileSync(mainPath, JSON.stringify(main, null, 2) + '\n');
  console.log('Built podium: 4 keyframes + exact mirrors, 10 body / 6 crest sheets, 60 combinations, ' + width + 'x' + height + '.');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
