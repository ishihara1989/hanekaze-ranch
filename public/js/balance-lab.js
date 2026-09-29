/* Independent balance workbench; does not load or modify the ranch save. */
(function () {
  'use strict';
  const R = RacePhysics, B = BalancePresets, X = BalanceRunner;
  const $ = selector => document.querySelector(selector);
  let presets = structuredClone(B.PRESETS), columns = [], traces = [], selectedId = 'tide', distance = 2400;
  let worker, pacingWorker, requestId = 0, busy = false;
  const settings = () => ({course:$('#course').value, policy:$('#policy').value, dt:.1});
  const selected = () => presets.find(p => p.id === selectedId);
  const formatTime = time => `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`;
  function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
  function setBusy(value) {
    busy = value;
    for (const el of document.querySelectorAll('#recalculate, #export, #parameters button, #parameters input, #course, #policy, #apply-pacing')) el.disabled = value;
    $('#export').disabled = value || !columns.length;
  }
  $('#policy').innerHTML = Object.entries(X.POLICIES).map(([value, name]) => `<option value="${value}">${name}</option>`).join('');
  $('#distance').innerHTML = B.DISTANCES.map(d => `<option value="${d}">${d}m</option>`).join('');
  $('#distance').value = distance;
  $('#bird').innerHTML = presets.map(p => `<option value="${p.id}">${p.name} · 初期例 ${p.exampleDistance}m</option>`).join('');
  function renderEditor() {
    const p = selected(), values = R.parameters(p.parameters);
    $('#bird').value = selectedId;
    $('#bird-description').textContent = p.description;
    $('#parameter-fields').innerHTML = R.PARAMS.map(def => `<div class="parameter-row"><label for="p-${def.key}">${def.label}<small>${def.key}${def.unit ? ` · ${def.unit}` : ''}</small></label><input id="p-${def.key}" name="${def.key}" type="number" min="${def.min}" max="${def.max}" step="${def.step}" value="${values[def.key]}" required ${busy ? 'disabled' : ''}></div>`).join('');
    $('#derived').textContent = `有酸素出力上限 Amax = ${R.criticalPower(values).toFixed(2)} W/kg（巡航速度と走行コストから算出）。`;
  }
  function renderMatrix() {
    if (!columns.length) { $('#matrix').innerHTML = '<p class="empty">7羽 × 7距離を計算しています。</p>'; return; }
    $('#matrix').innerHTML = `<table class="matrix"><caption class="footnote">時計（分:秒）・着順・最速との差</caption><thead><tr><th scope="col">個体 / 初期例</th>${columns.map(c => `<th scope="col">${c.distance}m</th>`).join('')}</tr></thead><tbody>${presets.map(p => `<tr><th scope="row"><span class="bird-dot" style="background:${p.color}"></span>${p.name}<span class="preset-hint">${p.exampleDistance}m型</span></th>${columns.map(c => {
      const r = c.results.find(r => r.id === p.id);
      return `<td class="${r.rank === 1 ? 'winner' : ''}"><button data-bird="${p.id}" data-distance="${c.distance}" aria-pressed="${p.id === selectedId && c.distance === distance}" aria-label="${p.name} ${c.distance}m ${r.finished ? r.rank + '位' : '時間内未完走'}"><strong>${r.finished ? formatTime(r.time) : '未完走'}</strong>${r.finished ? `<span class="cell-rank">${r.rank}位</span><small>${r.rank === 1 ? 'BEST' : '+' + r.gap.toFixed(2) + ' s'}</small>` : ''}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function renderLegend() {
    $('#legend').innerHTML = presets.map(p => `<button data-bird="${p.id}" aria-pressed="${p.id === selectedId}"><span class="bird-dot" style="background:${p.color}"></span>${p.name}</button>`).join('');
  }
  function graph(title, description, series, max, unit, plotDistance = distance) {
    const width = 420, height = 207, left = 38, top = 15, plotWidth = 370, plotHeight = 162;
    const x = d => left + d / plotDistance * plotWidth;
    const y = value => top + plotHeight * (1 - value / max);
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const value = max * i / 4;
      svg += `<line class="grid" x1="${left}" x2="${left + plotWidth}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 6}" y="${y(value) + 3}" text-anchor="end">${value.toFixed(max === 100 ? 0 : 1)}</text>`;
    }
    for (let d = 0; d <= plotDistance; d += 400) svg += `<text x="${x(d)}" y="195" text-anchor="middle">${d}</text>`;
    for (const s of series.sort((a, b) => Number(a.active) - Number(b.active))) {
      const points = s.samples.map(point => `${x(point.distance).toFixed(2)},${y(s.value(point)).toFixed(2)}`).join(' ');
      svg += `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${s.active ? 2.8 : 1.3}" opacity="${s.active ? 1 : .3}" ${s.dashed ? 'stroke-dasharray="5 3"' : ''}/>`;
    }
    return `<figure class="chart"><figcaption>${title} <span class="muted">${unit}</span></figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}の走行距離ごとの推移"><title>${title}の走行距離ごとの推移</title>${svg}</svg><p>${description}</p></figure>`;
  }
  function renderDetail() {
    renderLegend();
    const p = selected(), r = traces.find(r => r.id === selectedId && r.distance === distance);
    $('#detail-title').textContent = `${distance}m · ${p.name}の走り`;
    if (!r) return;
    const column = columns.find(c => c.distance === distance), row = column.results.find(r => r.id === selectedId);
    const values = R.parameters(p.parameters);
    $('#summary').innerHTML = `<div><span>${r.finished ? '走破時計 / 着順' : '計算終了'}</span><strong>${r.finished ? formatTime(r.time) : '未完走'}</strong> <small>${row.rank ? row.rank + '位' : ''}</small></div><div><span>${r.finished ? 'ゴール' : '計算終了'}時の予備容量</span><strong>${(r.state.reserve / values.reserveCapacity * 100).toFixed(1)}<small> %</small></strong></div><div><span>${r.finished ? 'ゴール' : '計算終了'}時の脚疲労</span><strong>${(r.state.fatigue * 100).toFixed(1)}<small> %</small></strong></div><div class="strategy-note">${r.strategy.kickAt >= distance ? '発走から最高速度を要求' : `巡航速度 × ${r.strategy.pace} → 残り${r.strategy.kickAt}mで最高速度を要求`}${r.strategy.openingBoost ? ` / 最初の${r.strategy.openingDuration}秒は巡航倍率に +${r.strategy.openingBoost}` : ''}。実速度は出力と脚の状態から決まります。</div>`;
    const series = value => traces.map(trace => ({samples:trace.samples, value:point => value(point, trace),
      color:presets.find(p => p.id === trace.id).color, active:trace.id === selectedId}));
    $('#charts').innerHTML = graph('速度', '加速・失速・スパートの形を比較。', series(s => s.speed), 32, 'm/s') +
      graph('無酸素の予備容量 W', '低いほど、高い出力を維持できる時間が短い。', series((s, t) => s.reserve / t.parameters.reserveCapacity * 100), 100, '%') +
      graph('脚疲労 L', '高いほど、出せる推進力が非線形に低下。', series(s => s.fatigue * 100), 100, '%') +
      graph('出力と有酸素供給 A', `${p.name}のみ。実線＝使用出力、破線＝有酸素供給。差をWで補います。`, [
        {samples:r.samples, value:s => s.power, color:p.color, active:true},
        {samples:r.samples, value:s => s.aerobic, color:'#183d36', active:true, dashed:true},
      ], Math.ceil(Math.max(1, ...r.samples.map(s => Math.max(s.power, s.aerobic))) / 20) * 20, 'W/kg');
    $('#laps').innerHTML = `<table><caption>${p.name} · 400mごとのラップと状態</caption><thead><tr><th scope="col">地点</th><th scope="col">区間時計</th><th scope="col">通過速度</th><th scope="col">予備容量</th><th scope="col">脚疲労</th></tr></thead><tbody>${r.splits.map(s => `<tr><th scope="row">${s.distance}m</th><td>${s.duration.toFixed(2)} s</td><td>${s.speed.toFixed(2)} m/s</td><td>${(s.reserve / values.reserveCapacity * 100).toFixed(1)}%</td><td>${(s.fatigue * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`;
  }
  function requestTraces() {
    if (!columns.length) return;
    const column = columns.find(c => c.distance === distance);
    traces = [];
    $('#summary').innerHTML = '';
    $('#charts').innerHTML = '<p class="muted">走行データを読み込んでいます…</p>';
    $('#laps').innerHTML = '';
    renderDetail();
    worker.postMessage({id:requestId, type:'traces', presets, options:settings(), distance,
      strategies:Object.fromEntries(column.results.map(r => [r.id, r.strategy]))});
  }
  function calculate() {
    if (worker) worker.terminate();
    requestId++;
    columns = []; traces = [];
    setBusy(true); renderMatrix();
    $('#summary').innerHTML = ''; $('#charts').innerHTML = ''; $('#laps').innerHTML = '';
    status('作戦と距離を比較しています…');
    $('#protocol').textContent = settings().policy === 'search' ?
      '探索：巡航倍率0.85〜1.40（0.025刻み）× スパート残り0・200・400・600・800・1200m、および全力走。全個体に共通の139候補。候補内の最速を採用します。' :
      '同じ作戦ルールを7羽に適用します。最高速・巡航速度が違うため、要求される速度も個体ごとに変わります。';
    try {
      worker = new Worker('js/balance-worker.js');
      worker.onmessage = ({data}) => {
        if (data.id !== requestId) return;
        if (data.type === 'progress') status(`比較中 ${data.done} / ${data.total} 距離`);
        if (data.type === 'matrix') {
          columns = data.columns; setBusy(false); renderMatrix(); requestTraces();
          status('7羽 × 7距離の比較が完了しました。');
        }
        if (data.type === 'traces' && data.results[0].distance === distance) { traces = data.results; renderDetail(); }
        if (data.type === 'error') { setBusy(false); status(data.message, true); }
      };
      worker.onerror = () => { setBusy(false); status('計算用Workerを起動できません。node server.cjsで起動したURLから開いてください。', true); };
      worker.postMessage({id:requestId, type:'matrix', presets, distances:B.DISTANCES, options:settings()});
    } catch (error) { setBusy(false); status(error.message, true); }
  }
  function chooseBird(id) { selectedId = id; renderEditor(); renderMatrix(); renderDetail(); }
  $('#matrix').addEventListener('click', event => {
    const button = event.target.closest('button[data-bird]');
    if (!button || busy) return;
    const changed = distance !== Number(button.dataset.distance);
    distance = Number(button.dataset.distance); $('#distance').value = distance;
    chooseBird(button.dataset.bird);
    if (changed) requestTraces();
  });
  $('#legend').addEventListener('click', event => { const button = event.target.closest('button[data-bird]'); if (button) chooseBird(button.dataset.bird); });
  $('#bird').addEventListener('change', () => chooseBird($('#bird').value));
  $('#distance').addEventListener('change', () => { distance = Number($('#distance').value); renderMatrix(); requestTraces(); });
  $('#parameters').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const input = Object.fromEntries(R.PARAMS.map(def => [def.key, Number($(`#p-${def.key}`).value)]));
      selected().parameters = R.parameters(input); renderEditor(); calculate();
    } catch (error) { status(error.message, true); }
  });
  $('#reset').addEventListener('click', () => { presets = structuredClone(B.PRESETS); renderEditor(); calculate(); });
  $('#recalculate').addEventListener('click', () => $('#parameters').requestSubmit());
  for (const id of ['course', 'policy']) $(`#${id}`).addEventListener('change', () => $('#parameters').requestSubmit());
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({modelVersion:2, options:settings(), presets, columns}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'chocobo-balance.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function showPacingComparison(comparison) {
    const {results, distance:demoDistance} = comparison;
    const spurt = results.find(r => r.id === 'spurt');
    $('#pacing-status').textContent = `比較完了：${comparison.search.candidates.toLocaleString()}候補を探索。候補内の最速であり、任意のペース配分の最適解を保証するものではありません。`;
    $('#pacing-results').innerHTML = `<div class="table-scroll"><table><thead><tr><th>作戦</th><th>時計</th><th>最初の400m</th><th>最後の400m</th></tr></thead><tbody>${results.map(r => `<tr><th><span class="bird-dot" style="background:${r.color}"></span>${r.name}${r.rank === 1 ? ' / BEST' : ''}</th><td>${r.finished ? formatTime(r.time) : '未完走'}</td><td>${r.splits[0].duration.toFixed(2)} s</td><td>${r.finished ? r.splits.at(-1).duration.toFixed(2) + ' s' : '—'}</td></tr>`).join('')}</tbody></table></div><p class="muted">探索したスパート作戦：${(spurt.parameters.criticalSpeed * spurt.strategy.pace).toFixed(2)} m/sで巡航 → 残り${spurt.strategy.kickAt}mで最高速を要求。</p><p class="footnote">この例もゴール直前には予備容量が尽きて減速しますが、最後の400m全体は巡航区間より速くなります。終盤の加速を、速度のグラフで確認できます。</p><div class="pacing-key">${results.map(r => `<span><span class="bird-dot" style="background:${r.color}"></span>${r.name}</span>`).join('')}</div>`;
    const series = value => results.map(r => ({samples:r.samples, color:r.color, active:true, value:point => value(point, r)}));
    $('#pacing-charts').innerHTML = graph('同じ個体の速度比較', '緑：巡航→スパート。青：一定の目標速度。', series(s => s.speed), 28, 'm/s', demoDistance) +
      graph('同じ個体の脚疲労比較', '早く疲労が増えるほど、その後の走行コストも高くなります。', series(s => s.fatigue * 100), 100, '%', demoDistance);
  }
  $('#compare-pacing').addEventListener('click', () => {
    $('#compare-pacing').disabled = true;
    $('#pacing-status').textContent = '一定ペースとスパート位置を細かく比較しています…';
    if (pacingWorker) pacingWorker.terminate();
    pacingWorker = new Worker('js/balance-worker.js');
    const finish = () => { $('#compare-pacing').disabled = false; pacingWorker.terminate(); pacingWorker = null; };
    pacingWorker.onmessage = ({data}) => {
      if (data.type === 'pacing-example') showPacingComparison(data.comparison);
      else $('#pacing-status').textContent = data.message;
      finish();
    };
    pacingWorker.onerror = () => { $('#pacing-status').textContent = '作戦比較の計算に失敗しました。'; finish(); };
    pacingWorker.postMessage({id:0, type:'pacing-example'});
  });
  $('#apply-pacing').addEventListener('click', () => {
    selected().parameters = structuredClone(B.PACING_EXAMPLE.parameters);
    selected().description = B.PACING_EXAMPLE.description;
    distance = B.PACING_EXAMPLE.distance; $('#distance').value = distance;
    $('#course').value = 'flat'; $('#policy').value = 'search';
    renderEditor(); calculate();
  });
  $('#pacing-parameters').innerHTML = `<table><tbody>${R.PARAMS.map(def => `<tr><th>${def.label} / ${def.key}</th><td>${R.parameters(B.PACING_EXAMPLE.parameters)[def.key]} ${def.unit}</td></tr>`).join('')}</tbody></table>`;
  renderEditor(); renderLegend(); calculate();
})();
