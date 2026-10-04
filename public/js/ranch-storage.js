/* Save transactions resolve only after IndexedDB commits them. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RanchStorage=api;
})(globalThis,()=>{
  'use strict';
  const DB_NAME='hanekaze-ranch',STORE='saves',SUMMARIES='slot-summaries',MIGRATION='localStorage-v4-migrated';
  function create({indexedDB=globalThis.indexedDB,legacyStorage=()=>globalThis.localStorage,channelFactory=name=>typeof BroadcastChannel==='function'?new BroadcastChannel(name):null}={}) {
    let db,channel;const listeners=new Set();
    const changed=()=>Object.assign(new Error('changed'),{code:'changed'});
    function transaction(mode,work) {
      return new Promise((resolve,reject)=>{
        let result,error,tx;
        try {
          tx=db.transaction([STORE,SUMMARIES],mode);
          tx.oncomplete=()=>resolve(result);
          tx.onabort=()=>reject(error||tx.error||new Error('保存処理が中断されました。'));
          work(tx.objectStore(STORE),value=>{result=value;},reason=>{error=reason;tx.abort();},tx.objectStore(SUMMARIES));
        }catch(e){if(tx){error=e;tx.abort();}else reject(e);}
      });
    }
    async function init(keys,{readKeys=keys}={}) {
      db=await new Promise((resolve,reject)=>{
        if(!indexedDB){reject(new Error('IndexedDB unavailable'));return;}
        const request=indexedDB.open(DB_NAME,2);let blocked=false;
        request.onupgradeneeded=()=>{
          if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
          if(!request.result.objectStoreNames.contains(SUMMARIES))request.result.createObjectStore(SUMMARIES);
        };
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>{blocked=true;reject(new Error('他のタブを閉じて再読み込みしてください。'));};
        request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
      });
      db.onversionchange=()=>{db.close();};
      try {
        // The marker prevents stale legacy backups from being re-imported later.
        if(await read(MIGRATION)===null) {
          const legacy=legacyStorage(),entries=keys.map(key=>[key,legacy.getItem(key)]);
          await transaction('readwrite',(store)=>{
            const marker=store.get(MIGRATION);
            marker.onsuccess=()=>{
              if(marker.result!==undefined)return;
              for(const [key,value] of entries)if(value!==null){
                const existing=store.get(key);
                existing.onsuccess=()=>{if(existing.result===undefined)store.put(value,key);};
              }
              store.put(true,MIGRATION);
            };
          });
        }
        // Legacy values remain untouched as a recovery backup.
        try{channel=channelFactory(DB_NAME);if(channel)channel.onmessage=event=>{for(const listener of listeners)listener(event.data);};}catch{}
        return await readAll(readKeys);
      }catch(e){db.close();db=null;throw e;}
    }
    function read(key) {
      return transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result??null);});
    }
    function readAll(keys) {
      return transaction('readonly',(store,done)=>{
        const values=new Map();done(values);
        for(const key of keys){const request=store.get(key);request.onsuccess=()=>values.set(key,request.result??null);}
      });
    }
    // Summaries are disposable display data. Loading always reads and validates
    // the full snapshot; both stores commit (or roll back) together.
    function readSummaries(keys) {
      return transaction('readonly',(store,done,abort,summaries)=>{
        const values=new Map();done(values);
        for(const key of keys){
          const exists=store.getKey(key);
          exists.onsuccess=()=>{
            if(exists.result===undefined){values.set(key,null);return;}
            const request=summaries.get(key);request.onsuccess=()=>values.set(key,request.result);
          };
        }
      });
    }
    function writeSummary(key,expectedRaw,summary) {
      return transaction('readwrite',(store,done,abort,summaries)=>{
        const request=store.get(key);
        request.onsuccess=()=>{
          if((request.result??null)!==expectedRaw){abort(changed());return;}
          summaries.put(summary,key);
        };
      });
    }
    async function write(key,value,expectedRaw,summary) {
      await transaction('readwrite',(store,done,abort,summaries)=>{
        const request=store.get(key);
        request.onsuccess=()=>{
          if(expectedRaw!==undefined&&(request.result??null)!==expectedRaw){abort(changed());return;}
          store.put(value,key);
          if(summary===undefined)summaries.delete(key);else summaries.put(summary,key);
        };
      });
      try{channel?.postMessage({key});}catch{}
    }
    async function restore(slot,expectedSlot,key,value,expectedAutosave) {
      await transaction('readwrite',(store,done,abort,summaries)=>{
        const request=store.get(slot);
        request.onsuccess=()=>{
          if((request.result??null)!==expectedSlot){abort(changed());return;}
          const current=store.get(key);
          current.onsuccess=()=>{
            if((current.result??null)!==expectedAutosave){abort(changed());return;}
            store.put(value,key);
            summaries.delete(key);
          };
        };
      });
      try{channel?.postMessage({key});}catch{}
    }
    return {init,read,readAll,readSummaries,writeSummary,write,restore,subscribe:listener=>listeners.add(listener),close(){channel?.close();db?.close();}};
  }
  return {create,DB_NAME,STORE,SUMMARIES};
});
