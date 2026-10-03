(function () {
  'use strict';
  const directory = 'assets/chocobo-sprite-study/v5/';
  const get = id => document.getElementById(id);
  const requestedMotion = new URLSearchParams(location.search).get('motion');
  const state = { playing: true, fps: requestedMotion === 'podium' ? 5 : requestedMotion === 'walk' ? 6 : 10, frame: 0, sequenceIndex: 0, size: 216, body: 'yellow', crest: 'yellow', motion: ['spurt','walk','podium'].includes(requestedMotion) ? requestedMotion : 'run', lastTime: null, accumulated: 0, ready: false };
  const images = new Map(), views = [];
  let manifest;
  const panel = (canvas, mode, body) => ({ canvas, mode, body, context: canvas.getContext('2d') });
  document.querySelectorAll('[data-layer]').forEach(canvas => {
    const view = panel(canvas, canvas.dataset.layer, canvas.dataset.body);
    view.motion = canvas.dataset.motion;
    if (canvas.dataset.frame !== undefined) view.frame = Number(canvas.dataset.frame);
    views.push(view);
  });
  function setPlaying(value) {
    state.playing = value; state.lastTime = null; state.accumulated = 0;
    if (manifest) state.sequenceIndex = sequence().indexOf(state.frame);
    get('play').textContent = value ? '一時停止' : '再生';
  }
  function syncFrame() {
    const count = manifest ? sheet().frameCount : 8;
    get('frame').max = count - 1;
    get('frame').value = state.frame;
    get('frame-value').textContent = String(state.frame + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0');
    if (manifest) get('phase').textContent = sheet().phases[state.frame];
    document.querySelectorAll('.frame-label').forEach(label => label.textContent = 'FRAME ' + String(state.frame + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0'));
  }
  function syncColors() {
    if (!manifest) return;
    const active = sheet();
    get('combination').textContent = manifest.body[state.body].label + 'の体 × ' + manifest.crest[state.crest].label + 'の額羽';
    get('body-link').href = directory + active.body[state.body].file;
    get('crest-link').href = directory + active.crest[state.crest].file;
    document.querySelectorAll('[data-body-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.bodyChoice === state.body)));
    document.querySelectorAll('[data-crest-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.crestChoice === state.crest)));
    draw();
  }
  function selectBody(value) { state.body = value; get('body').value = value; syncColors(); }
  function selectCrest(value) { state.crest = value; get('crest').value = value; syncColors(); }
  function sheet(motion = state.motion) { return manifest.motions?.[motion] || manifest; }
  function sequence() { return sheet().frameSequence || Array.from({ length: sheet().frameCount }, (_, i) => i); }
  function imageFor(kind, key, motion = state.motion) { return images.get(motion + ':' + kind + ':' + key); }
  function draw() {
    if (!state.ready) return;
    for (const view of views) {
      const motion = view.motion || state.motion, active = sheet(motion);
      const frame = (view.frame ?? state.frame) % active.frameCount;
      const sx = frame % active.columns * active.cellWidth, sy = Math.floor(frame / active.columns) * active.cellHeight;
      const rect = view.canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (view.canvas.width !== width || view.canvas.height !== height) { view.canvas.width = width; view.canvas.height = height; }
      const context = view.context;
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, rect.width, rect.height);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      if (view.mode === 'crest-choice') {
        const crop = active.crestCrop || { x: 260, y: 12, width: 180, height: 142 };
        const scale = Math.min((rect.width - 22) / crop.width, (rect.height - 12) / crop.height);
        context.drawImage(imageFor('crest', view.crest, motion), sx + crop.x, sy + crop.y, crop.width, crop.height, (rect.width - crop.width * scale) / 2, (rect.height - crop.height * scale) / 2, crop.width * scale, crop.height * scale);
        continue;
      }
      const isGallery = view.mode === 'body-choice';
      const desired = isGallery ? 110 : state.size;
      const scale = Math.min(desired / .84 / active.cellHeight, (rect.width - (isGallery ? 12 : 24)) / active.cellWidth);
      const dw = active.cellWidth * scale, dh = active.cellHeight * scale;
      const dx = (rect.width - dw) / 2, dy = rect.height - (isGallery ? 10 : 26) - dh * (active.anchor?.y ?? .92);
      const render = image => context.drawImage(image, sx, sy, active.cellWidth, active.cellHeight, dx, dy, dw, dh);
      if (view.mode !== 'crest') render(imageFor('body', view.body || state.body, motion));
      if (view.mode !== 'body') render(imageFor('crest', state.crest, motion));
    }
  }
  function tick(time) {
    if (state.lastTime !== null && state.playing && state.ready) {
      state.accumulated += Math.min(time - state.lastTime, 250);
      const steps = Math.floor(state.accumulated / (1000 / state.fps));
      if (steps) { const order = sequence(); state.sequenceIndex = (state.sequenceIndex + steps) % order.length; state.frame = order[state.sequenceIndex]; state.accumulated %= 1000 / state.fps; syncFrame(); }
    }
    state.lastTime = time; draw(); requestAnimationFrame(tick);
  }
  get('play').addEventListener('click', () => setPlaying(!state.playing));
  get('body').addEventListener('change', event => selectBody(event.target.value));
  get('crest').addEventListener('change', event => selectCrest(event.target.value));
  get('motion').addEventListener('change', event => { state.motion = event.target.value; state.fps = sheet().recommendedFps; state.frame = 0; state.sequenceIndex = 0; state.accumulated = 0; get('fps').value = state.fps; get('fps-value').textContent = state.fps + ' fps'; syncColors(); syncFrame(); });
  get('fps').addEventListener('input', event => { state.fps = Number(event.target.value); get('fps-value').textContent = state.fps + ' fps'; state.accumulated = 0; });
  get('size').addEventListener('change', event => { state.size = Number(event.target.value); draw(); });
  get('background').addEventListener('change', event => document.querySelectorAll('.stage').forEach(stage => stage.dataset.background = event.target.value));
  get('frame').addEventListener('input', event => { setPlaying(false); state.frame = Number(event.target.value); syncFrame(); draw(); });
  get('step').addEventListener('click', () => { setPlaying(false); state.frame = (state.frame + 1) % sheet().frameCount; syncFrame(); draw(); });
  async function load() {
    const response = await fetch(directory + 'manifest.json');
    if (!response.ok) throw new Error('素材一覧を読み込めませんでした。');
    manifest = await response.json();
    for (const [kind, collection] of [['body', manifest.body], ['crest', manifest.crest]]) {
      for (const [key, entry] of Object.entries(collection)) {
        const option = document.createElement('option'); option.value = key; option.textContent = entry.label; get(kind).append(option);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'swatch';
        button.dataset[kind + 'Choice'] = key; button.setAttribute('aria-label', (kind === 'body' ? '羽色を' : '額羽を') + entry.label + 'にする');
        const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.textContent = entry.label; button.append(canvas, name);
        get(kind + '-gallery').append(button);
        const view = panel(canvas, kind + '-choice', kind === 'body' ? key : undefined); if (kind === 'crest') view.crest = key;
        views.push(view);
        button.addEventListener('click', () => kind === 'body' ? selectBody(key) : selectCrest(key));
      }
    }
    await Promise.all(['run', ...Object.keys(manifest.motions || {})].flatMap(motion => ['body', 'crest'].flatMap(kind => Object.entries(sheet(motion)[kind]).map(([key, entry]) => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => { images.set(motion + ':' + kind + ':' + key, image); resolve(); }; image.onerror = () => reject(new Error(entry.file + ' を読み込めませんでした。')); image.src = directory + entry.file;
    })))));
    state.ready = true; get('body').value = state.body; get('crest').value = state.crest;
    get('motion').value = state.motion;
    get('fps').value = state.fps; get('fps-value').textContent = state.fps + ' fps';
    syncColors(); syncFrame();
    get('status').textContent = '歩行・通常走行・ラストスパート・表彰とも、本体10色 × 額羽6色の60通り。表彰は待機と挨拶を長めに止めて左右へ応えます。';
  }
  load().catch(error => { get('status').textContent = error.message; setPlaying(false); });
  syncFrame(); requestAnimationFrame(tick);
})();
