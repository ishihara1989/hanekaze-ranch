'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Library=require('../public/js/ranch-library.js');
const R=require('../public/js/ranch-engine.js');

test('manual distinguishes same-year crowns, farm-wide eight races and direct-offspring founder qualifications',()=>{
  const body=id=>Library.entries.find(entry=>entry.id===id).body;
  const honors=body('honors');
  for(const name of R.EIGHT)assert.ok(honors.includes(name));
  for(const names of Object.values(R.TITLES))for(const name of names)assert.ok(honors.includes(name));
  assert.match(honors,/同じ羽が同一年/);assert.match(honors,/複数の羽・複数の年/);
  assert.match(honors,/牧場手帳に上の8競走すべての制覇記録がそろう/);
  assert.match(honors,/売却・返還して牧場にいなくなっても、制覇記録は建設条件の対象に残ります/);
  assert.doesNotMatch(honors,/現在自牧場が所有する羽|建設条件の対象から外れます/);
  assert.match(honors,/春古羽三冠・秋古羽三冠は銅像の建設条件には含まれません/);
  const founders=body('founders');
  assert.match(founders,/自家製種牡羽/);assert.match(founders,/3羽以上/);assert.match(founders,/合計7勝以上/);
  assert.match(founders,/12月第4週/);assert.match(founders,/先代は供用を終えます/);
});

test('reference covers every displayed trait and its hidden inheritance limits remain readable from day one',()=>{
  const all=Library.entries.map(entry=>entry.body).join('');
  const labels=[...R.Mapping.ABILITIES.map(a=>a.label),...Object.values(R.MANAGEMENT),...Object.values(R.PERSONALITY),...Object.values(R.Genetics.APTITUDES),...Object.values(R.Genetics.DEVELOPMENT)];
  for(const label of labels)assert.ok(all.includes(label),label);
  assert.match(all,/37\.5%/);assert.match(all,/Aaだけでは能力は下がりません/);
  assert.match(all,/Lv\.9で75%/);assert.match(all,/GGでは孵化しません/);
  assert.ok(Library.search('ｇｉ ７勝').some(entry=>entry.id==='founders'));
});

test('library ships through the normal server and loads before the UI',()=>{
  const index=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  assert.ok(index.indexOf('js/ranch-library.js')<index.indexOf('js/ranch-ui.js'));
  assert.match(fs.readFileSync(require.resolve('../server.cjs'),'utf8'),/'js\/ranch-library\.js'/);
});
