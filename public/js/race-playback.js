const R=globalThis.RaceReplay;
const phases={paddock:'パドック',gate:'ゲートイン',race:'レース',result:'決着',award:'表彰式'};
const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;

// Playback, standings and commentary are shared by both renderers.
export class RacePlayback {
  constructor(root,record,track,options={}){
    this.root=root;this.record=record;this.track=track;this.replay=record.replay;
    this.timeline=R.timeline(record);this.cues=R.commentary(record);
    this.time=Math.max(0,Math.min(this.timeline.end,options.time??0));this.rate=options.rate??1;
    this.paused=document.hidden||(options.paused??matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.cameraMode=options.cameraMode??'broadcast';
    this.focusId=this.replay.runners.some(r=>r.id===options.focusId)?options.focusId:record.birdId||this.replay.runners.find(r=>r.player)?.id||this.replay.runners[0].id;
    this.speaking=!!options.speaking&&'speechSynthesis'in window;this.lastCue=-1;this.disposed=false;this.ready=false;
    this.$=s=>root.querySelector(s);this.stage=this.$('.race-stage');this.status=this.$('.race-loading');
    this.onClick=e=>{const button=e.target.closest('[data-viewer]');if(!button)return;e.stopPropagation();this.control(button);};
    this.onInput=e=>{if(e.target.matches('[data-viewer-seek]')){e.stopPropagation();this.seek(Number(e.target.value));}};
    this.onChange=e=>{
      if(e.target.matches('[data-viewer-speed]')){e.stopPropagation();this.rate=Number(e.target.value);this.cancelSpeech();}
      if(e.target.matches('[data-viewer-focus]')){e.stopPropagation();this.focusId=e.target.value;
        if(this.ready&&R.phase(this.record,this.time)==='paddock'){
          const index=R.paddockOrder(this.record).findIndex(r=>r.id===this.focusId);
          if(index>=0)this.seek(R.PADDOCK.intro+index*R.PADDOCK.runnerSeconds);
        }
      }
      if(e.target.matches('[data-viewer-seek]'))e.stopPropagation();
    };
    this.onVisibility=()=>{if(document.hidden){this.paused=true;this.cancelSpeech();this.updateControls();}};
    root.addEventListener('click',this.onClick);root.addEventListener('input',this.onInput);root.addEventListener('change',this.onChange);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.decor=R.ceremony(record.level);
  }
  snapshot(){
    return {time:this.time,paused:this.paused,rate:this.rate,focusId:this.focusId,cameraMode:this.cameraMode,speaking:this.speaking,
      ...(this.motionPitch!==undefined?{pitch:this.motionPitch}:{})};
  }
  readFrame(){return R.frame(this.record,this.track,this.time);}
  updateOverlay(phase,order,raceTime){
    const paddock=phase==='paddock'?R.paddockAt(this.record,this.time):null;
    this.$('[data-race-phase]').textContent=phases[phase];
    this.$('[data-race-clock]').textContent=phase==='race'?format(raceTime):phase==='award'?this.decor.title:phase==='gate'?`${Math.ceil(this.timeline.race-this.time)}秒後に発走`:paddock?`${paddock.runner.lane+1}番 ${paddock.runner.name}`:'RACE REPLAY';
    this.$('[data-race-remaining]').textContent=phase==='race'?`残り ${Math.ceil(Math.max(0,this.record.distance-order[0].distance))}m`:paddock?`出走羽紹介 ${paddock.index+1} / ${paddock.total}`:phase==='result'?`${this.record.rank}着 / ${format(this.record.time)}`:'';
    const controls=this.$('[data-paddock-controls]');if(controls)controls.hidden=!paddock;
    this.root.querySelectorAll('[data-viewer="paddock-prev"],[data-viewer="paddock-next"]').forEach(el=>{
      el.disabled=!paddock||(el.dataset.viewer==='paddock-prev'?paddock.index===0:paddock.index===paddock.total-1);
    });
    const label=this.$('[data-paddock-progress]');if(label&&paddock)label.textContent=`${paddock.index+1} / ${paddock.total}羽`;
    if(paddock)this.$('[data-viewer-focus]').value=paddock.runner.id;
    if(this.lastListTime===undefined||this.time<this.lastListTime||this.time-this.lastListTime>=.2||phase!==this.listPhase||paddock?.index!==this.lastPaddockIndex){
      const list=this.$('[data-live-order]');list.replaceChildren();
      const racing=['race','result','award'].includes(phase),shown=racing?order:order.slice().sort((a,b)=>a.lane-b.lane);
      list.setAttribute('aria-label',racing?'現在の上位5羽':'出走羽');
      const start=paddock?Math.min(Math.max(0,paddock.index-2),Math.max(0,shown.length-5)):0;
      shown.slice(start,start+5).forEach((r,i)=>{const row=document.createElement('li');row.className=[r.player?'is-player':'',r.id===paddock?.runner.id?'is-paddock-focus':''].filter(Boolean).join(' ');
        if(paddock)row.setAttribute('aria-current',String(r.id===paddock.runner.id));
        const rank=document.createElement('span');rank.textContent=String(racing?i+1:r.lane+1);const name=document.createElement('b');name.textContent=r.name;
        const gap=document.createElement('small');gap.textContent=!racing?(r.id===paddock?.runner.id?'紹介中':`${r.lane+1}番`):r.finished?'入線':i===0?'先頭':`${Math.max(0,order[0].distance-r.distance).toFixed(1)}m`;
        row.append(rank,name,gap);list.append(row);});this.lastListTime=this.time;this.listPhase=phase;this.lastPaddockIndex=paddock?.index;
    }
    this.$('[data-viewer-seek]').value=this.time;
    this.$('[data-viewer-time]').textContent=`${format(this.time)} / ${format(this.timeline.end)}`;
    const index=this.cues.findLastIndex(c=>c.at<=this.time);
    if(index!==this.lastCue){
      this.lastCue=index;const cue=this.cues[index];
      if(cue){this.root.querySelectorAll('[data-commentator]').forEach(el=>el.classList.toggle('speaking',el.dataset.commentator===cue.speaker));
        this.$('[data-commentary-speaker]').textContent=cue.speaker==='lamia'?'ラミア / 実況':'サハギン / 解説';
        this.$('[data-commentary-text]').textContent=cue.text;
        if(this.speaking&&!this.paused)this.speak(cue);}
    }
  }
  speak(cue){
    if(!('speechSynthesis'in window))return;this.cancelSpeech();
    const utterance=new SpeechSynthesisUtterance(cue.text);utterance.lang='ja-JP';utterance.rate=Math.min(1.7,(cue.speaker==='lamia'?1.14:1)*Math.sqrt(this.rate));
    utterance.pitch=cue.speaker==='lamia'?1.3:.72;
    const voices=speechSynthesis.getVoices().filter(v=>v.lang.startsWith('ja'));
    utterance.voice=voices[cue.speaker==='lamia'?0:Math.min(1,voices.length-1)]||null;
    utterance.onend=()=>{this.utterance=null;};this.utterance=utterance;speechSynthesis.speak(utterance);
  }
  cancelSpeech(){if(this.utterance&&'speechSynthesis'in window){speechSynthesis.cancel();this.utterance=null;}}
  control(button){
    const action=button.dataset.viewer;if(!this.ready&&action!=='voice')return;
    if(action==='pause'){if(this.time>=this.timeline.end)this.seek(0);this.paused=!this.paused;this.cancelSpeech();
      if(this.speaking&&!this.paused&&this.cues[this.lastCue])this.speak(this.cues[this.lastCue]);}
    if(action==='restart'){this.paused=false;this.seek(0);}
    if(action==='phase')this.seek(this.timeline[button.dataset.phase]);
    if(action==='paddock-prev'||action==='paddock-next'){
      const current=R.paddockAt(this.record,this.time),index=Math.max(0,Math.min(current.total-1,current.index+(action==='paddock-next'?1:-1)));
      this.seek(R.PADDOCK.intro+index*R.PADDOCK.runnerSeconds);
    }
    if(action==='paddock-skip')this.seek(this.timeline.gate);
    if(action==='camera')this.cameraMode=button.dataset.camera;
    if(action==='voice'){
      if(!('speechSynthesis'in window)){this.$('[data-voice-status]').textContent='このブラウザでは字幕のみで実況します。';return;}
      this.speaking=!this.speaking;this.cancelSpeech();
      this.$('[data-voice-status]').textContent=this.speaking?'日本語読み上げ ON（声はブラウザの設定に従います）':'実況字幕 ON / 音声 OFF';
      if(this.speaking&&!this.paused&&this.cues[this.lastCue])this.speak(this.cues[this.lastCue]);
    }
    this.updateControls();if(this.ready)this.draw(0,true);
  }
  updateControls(){
    const pause=this.$('[data-viewer="pause"]');pause.textContent=this.paused?'▶ 再生':'Ⅱ 一時停止';pause.setAttribute('aria-pressed',String(this.paused));
    this.$('[data-viewer="voice"]').setAttribute('aria-pressed',String(this.speaking));
    this.$('[data-viewer-speed]').value=String(this.rate);this.$('[data-viewer-focus]').value=this.focusId;
    if('speechSynthesis'in window)this.$('[data-voice-status]').textContent=this.speaking?'日本語読み上げ ON（声はブラウザの設定に従います）':'実況字幕 ON / 音声 OFF';
    this.root.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===this.cameraMode)));
  }
  seek(time){if(!this.ready)return;this.time=Math.max(0,Math.min(this.timeline.end,time));this.lastCue=-1;this.lastListTime=-1;this.cancelSpeech();this.draw(0,true);}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.cancelSpeech();
    this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('input',this.onInput);this.root.removeEventListener('change',this.onChange);
    document.removeEventListener('visibilitychange',this.onVisibility);
  }
}
