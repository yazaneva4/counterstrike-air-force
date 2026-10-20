import test from 'node:test';
import assert from 'node:assert/strict';

test('failed HTTP cloud saves can retry; older failures cannot invalidate a newer save', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const { cloud } = await import('../src/net/cloud.js');
  cloud.online = true; cloud.sent = null;
  const settings = { profile: { name: 'Test' }, spawn: 'airbase', time: 'day' };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false }; };
  cloud.save(settings, null); await new Promise(resolve => setImmediate(resolve));
  assert.equal(cloud.sent, null);
  cloud.save(settings, null); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
  let failOld;
  globalThis.fetch = () => new Promise(resolve => { failOld = resolve; });
  cloud.save(settings, null);
  globalThis.fetch = async () => ({ ok: true });
  cloud.save({ ...settings, time: 'night' }, null);
  const latest = cloud.sent; failOld({ ok: false }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(cloud.sent, latest);
});

test('reconnect merges progress without replacing active pilot settings',async()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const {cloud}=await import('../src/net/cloud.js');
 cloud.online=false;
 globalThis.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({mysteries:['moon'],score:90,stats:{flights:3},profile:{name:'Remote'},spawn:'beach',time:'night'})});
 const settings={profile:{name:'Local'},spawn:'airbase',time:'day'};
 const game={score:100,stats:{flights:1,drones:4},mysteries:{found:new Set(['crash'])}};
 await cloud.reconcile(settings,game);assert.equal(cloud.online,true);assert.equal(settings.profile.name,'Local');assert.equal(settings.spawn,'airbase');
 assert.deepEqual([...game.mysteries.found],['crash','moon']);assert.equal(game.score,100);assert.equal(game.stats.flights,3);assert.equal(game.stats.drones,4);
});

test('periodic cloud refresh does not reset unsaved menu selections',async()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const {cloud}=await import('../src/net/cloud.js');
 globalThis.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({mysteries:[],score:5,profile:{name:'Old'},spawn:'beach',time:'night'})});
 const settings={profile:{name:'New'},spawn:'airbase',time:'day'};
 await cloud.reconcile(settings,null);assert.equal(settings.profile.name,'New');assert.equal(settings.spawn,'airbase');assert.equal(settings.time,'day');assert.equal(settings.saved.score,5);
});
