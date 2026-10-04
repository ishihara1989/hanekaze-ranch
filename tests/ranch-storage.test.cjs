'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const Storage=require('../public/js/ranch-storage.js');
const R=require('../tools/lib/ranch-fixtures.cjs').R;
const keys=[R.SAVE_KEY,...Array.from({length:5},(_,i)=>`${R.SAVE_KEY}-slot-${i+1}`)];
function environment(legacy=new Map()) {
  const factory=new IDBFactory(),reads=[];let failKey=null,failStore=null;
  const indexedDB={open(...args){
    const request=factory.open(...args);
    request.addEventListener('success',()=>{
      const db=request.result,original=db.transaction.bind(db);
      db.transaction=(...args)=>{
        const tx=original(...args),objectStore=tx.objectStore.bind(tx);
        tx.objectStore=(...args)=>{
          const store=objectStore(...args),put=store.put.bind(store),get=store.get.bind(store);
          store.get=key=>{reads.push({store:store.name,key});return get(key);};
          store.put=(value,key)=>{
            const request=put(value,key);
            // A successful request does not mean the transaction committed.
            if(key===failKey&&(failStore===null||store.name===failStore))request.addEventListener('success',()=>tx.abort());
            return request;
          };
          return store;
        };
        return tx;
      };
    });
    return request;
  }};
  const create=(overrides={})=>Storage.create({indexedDB,legacyStorage:()=>({getItem:key=>legacy.get(key)??null}),channelFactory:()=>null,...overrides});
  return {create,legacy,factory,reads,failOn:(key,store=null)=>{failKey=key;failStore=store;}};
}

test('migrates autosave and all slots atomically, including damaged data, retaining legacy backups',async()=>{
  const legacy=new Map(keys.map((key,i)=>[key,i===2?'{damaged':`save-${i}`]));
  const e=environment(legacy),s=e.create();
  assert.deepEqual(await s.init(keys),legacy);
  assert.deepEqual(e.legacy,legacy);s.close();
});

test('migration failure rolls back every entry and can be retried without losing legacy saves',async()=>{
  const legacy=new Map(keys.map((key,i)=>[key,`save-${i}`]));
  const e=environment(legacy),s=e.create();e.failOn(keys[2]);
  await assert.rejects(s.init(keys));e.failOn(null);
  const retry=e.create();assert.deepEqual(await retry.init(keys),legacy);retry.close();
});

test('existing IndexedDB saves win and completed migration never re-imports stale localStorage',async()=>{
  const e=environment(new Map([[keys[0],'old']])),s=e.create();
  await s.init(keys);await s.write(keys[0],'new','old');s.close();
  const next=e.create({legacyStorage:()=>{throw Error('legacy disabled');}});
  assert.equal((await next.init(keys)).get(keys[0]),'new');next.close();
});

test('a partial earlier database is preserved when importing missing legacy keys',async()=>{
  const e=environment(new Map([[keys[0],'legacy'],[keys[1],'slot']]));
  await new Promise((resolve,reject)=>{
    const request=e.factory.open(Storage.DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(Storage.STORE);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(Storage.STORE,'readwrite');
      tx.objectStore(Storage.STORE).put('newer',keys[0]);
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
    };
  });
  const next=e.create(),saved=await next.init(keys);
  assert.equal(saved.get(keys[0]),'newer');assert.equal(saved.get(keys[1]),'slot');next.close();
});

test('large full ranch autosave and five snapshots save and reload beyond the old localStorage limit',async()=>{
  const e=environment(),s=e.create();await s.init(keys);
  const raw=R.serializeState(R.initial()),slot=JSON.stringify({version:1,savedAt:new Date().toISOString(),data:raw});
  assert.ok(Buffer.byteLength(raw)+5*Buffer.byteLength(slot)>5*1024*1024);
  await s.write(keys[0],raw,null);
  for(const key of keys.slice(1))await s.write(key,slot,null);
  s.close();const next=e.create(),saved=await next.init(keys);
  assert.equal(saved.get(keys[0]),raw);
  for(const key of keys.slice(1))assert.equal(saved.get(key),slot);
  next.close();
});

test('transaction abort after successful put preserves the previous save and reports failure',async()=>{
  const e=environment(),s=e.create();await s.init(keys);await s.write(keys[1],'original',null);
  e.failOn(keys[1]);await assert.rejects(s.write(keys[1],'replacement','original'));
  assert.equal(await s.read(keys[1]),'original');s.close();
});

test('compare and write prevents simultaneous tabs from overwriting the same snapshot or autosave',async()=>{
  const e=environment(),a=e.create(),b=e.create();await a.init(keys);await b.init(keys);
  const results=await Promise.allSettled([a.write(keys[1],'a',null),b.write(keys[1],'b',null)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'changed');
  await a.write(keys[0],'first',null);await assert.rejects(b.write(keys[0],'stale',null),{code:'changed'});
  assert.equal(await b.read(keys[0]),'first');a.close();b.close();
});

test('load checks both slot and current autosave in one transaction and leaves autosave intact on failure',async()=>{
  const e=environment(),s=e.create();await s.init(keys);await s.write(keys[0],'current',null);await s.write(keys[1],'snapshot',null);
  await assert.rejects(s.restore(keys[1],'old',keys[0],'restored','current'),{code:'changed'});
  await assert.rejects(s.restore(keys[1],'snapshot',keys[0],'restored','old'),{code:'changed'});
  e.failOn(keys[0]);await assert.rejects(s.restore(keys[1],'snapshot',keys[0],'restored','current'));
  assert.equal(await s.read(keys[0]),'current');e.failOn(null);
  await s.restore(keys[1],'snapshot',keys[0],'restored','current');
  assert.equal(await s.read(keys[0]),'restored');assert.equal(await s.read(keys[1]),'snapshot');s.close();
});

test('unavailable IndexedDB or unreadable legacy storage does not create empty replacement saves',async()=>{
  const e=environment(new Map([[keys[0],'original']]));
  await assert.rejects(e.create({indexedDB:null}).init(keys));
  await assert.rejects(e.create({legacyStorage:()=>{throw Error('denied');}}).init(keys));
  const next=e.create();assert.equal((await next.init(keys)).get(keys[0]),'original');next.close();
});

test('startup reads only the requested autosave while still migrating every legacy slot',async()=>{
  const legacy=new Map(keys.map((key,i)=>[key,`save-${i}`])),e=environment(legacy),s=e.create();
  assert.deepEqual(await s.init(keys,{readKeys:[keys[0]]}),new Map([[keys[0],'save-0']]));
  s.close();e.reads.length=0;
  const next=e.create();await next.init(keys,{readKeys:[keys[0]]});
  assert.equal(e.reads.filter(r=>keys.slice(1).includes(r.key)).length,0);
  assert.equal(await next.read(keys[5]),'save-5');next.close();
});

test('slot summaries read no snapshot values and summary failures roll back both stores',async()=>{
  const e=environment(),s=e.create();await s.init(keys);
  const summary={version:1,savedAt:'2026-10-04T00:00:00Z',week:9,money:20000,owned:1};
  await s.write(keys[1],'original',null,summary);e.reads.length=0;
  const views=await s.readSummaries(keys.slice(1));
  assert.deepEqual(views.get(keys[1]),summary);assert.equal(views.get(keys[2]),null);
  assert.ok(e.reads.every(r=>r.store===Storage.SUMMARIES));
  e.failOn(keys[1],Storage.SUMMARIES);
  await assert.rejects(s.write(keys[1],'replacement','original',{...summary,week:10}));
  assert.equal(await s.read(keys[1]),'original');
  assert.deepEqual((await s.readSummaries([keys[1]])).get(keys[1]),summary);
  e.failOn(null);await s.write(keys[1],'without-summary','original');
  assert.equal((await s.readSummaries([keys[1]])).get(keys[1]),undefined);s.close();
});

test('summary backfill cannot attach stale metadata after another tab overwrites a slot',async()=>{
  const e=environment(),a=e.create(),b=e.create();await a.init(keys);await b.init(keys);
  await a.write(keys[1],'old',null);await b.write(keys[1],'new','old');
  await assert.rejects(a.writeSummary(keys[1],'old',{version:1,invalid:true}),{code:'changed'});
  assert.equal((await b.readSummaries([keys[1]])).get(keys[1]),undefined);
  assert.equal(await b.read(keys[1]),'new');a.close();b.close();
});

test('database upgrade closes old clients and preserves their snapshots',async()=>{
  const e=environment();let old;
  await new Promise((resolve,reject)=>{
    const request=e.factory.open(Storage.DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(Storage.STORE);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      old=request.result;old.onversionchange=()=>old.close();
      const tx=old.transaction(Storage.STORE,'readwrite');tx.objectStore(Storage.STORE).put('old-snapshot',keys[1]);
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    };
  });
  const next=e.create();await next.init(keys,{readKeys:[keys[0]]});
  assert.equal(await next.read(keys[1]),'old-snapshot');
  assert.throws(()=>old.transaction(Storage.STORE,'readwrite'),{name:'InvalidStateError'});
  await assert.rejects(new Promise((resolve,reject)=>{
    const request=e.factory.open(Storage.DB_NAME,1);request.onerror=()=>reject(request.error);request.onsuccess=resolve;
  }),{name:'VersionError'});next.close();
});
