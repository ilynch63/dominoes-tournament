// Exercise the real history UI controller with isolated browser storage. No live event is changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('./history-core.js'),data=require('./test-fixtures/history-baseline.json');
const D=require('./core.js');
function session(storage=new Map(),protocol='file:'){
 const elements=new Map(),downloads=[],messages=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:id==='historySeed'?JSON.stringify(data):'',click(){}});return elements.get(id);};
 const context=vm.createContext({DominoHistory:H,document:{getElementById:element,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},location:{protocol},Date,Map,Set,JSON,Number,String,Math,Error,Promise,AbortSignal,crypto:globalThis.crypto,fetch:async()=>({ok:true,json:async()=>data}),D,KEY:'current-event',state:{title:'Test tournament',players:['Georges','Irving','Tuto','Waldemar'],rounds:[{matches:[{teams:[[0,1],[2,3]],score:[104,21],table:1,wave:1}]}],playoffs:null},view:'history',esc:s=>String(s).replace(/[<>&"']/g,'_'),$:element,tell:t=>messages.push(t),ask:async()=>true,render:()=>{},save:()=>{},download:(name,text)=>downloads.push({name,text})});
 vm.runInContext(fs.readFileSync('history-ui.js','utf8'),context);
 return {context,storage,elements,element,downloads,messages,run:code=>vm.runInContext(code,context)};
}
(async()=>{
 const ui=session();
 assert(ui.run('historyView()').includes('All groups</option><option value="workbook"'));
 for(const tab of ['players','pairs','h2h','predict','events','manage']){ui.run(`historyTab='${tab}'`);assert(ui.run('historyView()').length>1000);}
 ui.run("const converted=H.eventFromState(state,historyData,{id:'new-test',date:'2026-11-14'});stageHistoryEvent(converted)");
 assert.equal(ui.run('historyData.events.length'),17);assert.equal(ui.run('historySummary.games.length'),125);
 ui.run('stageHistoryEvent(converted)');assert.equal(ui.run('historySummary.games.length'),125);
 const reload=session(ui.storage);assert.equal(reload.run('historySummary.games.length'),125);
 await ui.run('historyExport()');assert.equal(ui.downloads[0].name,'dominos-tournament-data.json');assert.equal(H.validate(JSON.parse(ui.downloads[0].text)).events.length,17);
 ui.run("state.rounds[0].matches[0].score=[120,60];stageHistoryEvent(H.eventFromState(state,historyData,{id:'new-test',date:'2026-11-14'}))");
 assert.equal(ui.run('historySummary.games.length'),125);assert.throws(()=>reload.run('stageHistoryEvent(H.eventFromState(state,historyData,{id:"other",date:"2026-11-14"}))'),/another tab/);
 // Once a draft is published, later corrections use that published revision as their base.
 ui.run("historyBase=JSON.parse(JSON.stringify(historyData));rebuildHistory();state.rounds[0].matches[0].score=[125,66];stageHistoryEvent(H.eventFromState(state,historyData,{id:'new-test',date:'2026-11-14'}))");
 assert.equal(ui.run('historyConflicts.length'),0);
 // Whole-file reimport replaces an event rather than duplicating games.
 ui.run("historyTab='manage';bindHistory()");
 await ui.element('historyDataFile').onchange({target:{files:[{size:100,text:async()=>ui.downloads[0].text}]}});
 assert.equal(ui.run('historySummary.games.length'),125);
 // Detect remote changes to a locally edited event and prevent unsafe export.
 ui.run("const changed=JSON.parse(JSON.stringify(historyData));changed.events.find(e=>e.id==='new-test').matches[0].score=[130,45];historyBase=changed;rebuildHistory()");
 assert.equal(ui.run('historyConflicts.length'),1);
 const before=ui.downloads.length;await ui.run('historyExport()');assert.equal(ui.downloads.length,before);
 // Invalid history and quota errors cannot replace saved history.
 const bad=session();assert.throws(()=>bad.run("stageHistoryEvent({players:historyData.players,event:{id:'bad',title:'Bad',date:'2026-02-30',matches:[]}})"));assert.equal(bad.storage.size,0);
 bad.run("localStorage.setItem=()=>{throw Error('Storage full')}");assert.throws(()=>bad.run("stageHistoryEvent(H.eventFromState(state,historyData,{id:'new-test',date:'2026-11-14'}))"),/Storage full/);assert.equal(bad.run('historyData.events.length'),16);
 const malformed=session(new Map([['domino-history-drafts-v1','not-json']]));assert(malformed.run('historyError').length>0);assert.equal(malformed.run('historyData.events.length'),16);
 // Loading newer published history keeps independent local events.
 const online=session(undefined,'http:');await online.run('refreshHistory()');assert.equal(online.run('historyStatus'),'Loaded from dominos-tournament-data.json');
 online.run("fetch=async()=>{throw Error('offline')}");await online.run('historyExport()');assert.equal(online.downloads.length,0);
 console.log('History UI checks passed: persistence, reload, correction, repeated export/import, conflicts, stale tabs, bad data, failed storage and failed refresh.');
})().catch(e=>{console.error(e);process.exitCode=1;});
