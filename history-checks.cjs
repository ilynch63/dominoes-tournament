const assert=require('node:assert/strict');
const fs=require('node:fs');
const H=require('./history-core.js');
H.validate(JSON.parse(fs.readFileSync('dominos-tournament-data.json','utf8')));
// Freeze the source reconciliation fixture so future JSON-only tournament PRs remain valid.
const data=H.validate(require('./test-fixtures/history-baseline.json'));
const reference=require('./test-fixtures/workbook-reference.json');
const s=H.summarize(data,{source:'workbook'});
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
assert.equal(s.games.length,102);assert.equal(data.events.length,16);assert.equal(data.players.length,27);
assert.equal(H.summarize(data).games.length,124);
assert.equal(data.events.flatMap(e=>e.matches).filter(m=>m.score===null).length,1);
for(const mode of ['players','pairs'])for(const expected of reference[mode]){
 const actual=[...s[mode].values()].find(p=>p.name===expected.name);assert(actual,expected.name);
 for(const [key,value] of Object.entries(expected))if(key!=='name')close(actual[key],value,expected.name+' '+key);
}
for(const row of reference.h2h){
 const a=[...s[row.mode].values()].find(p=>p.name===row.a),b=[...s[row.mode].values()].find(p=>p.name===row.b);assert(a&&b);
 const actual=H.h2h(s,a.id,b.id,row.mode),[games,rate,avg]=row.value.split(' / ');
 assert.equal(actual.played,Number(games));assert.equal((actual.winRate*100).toFixed(1)+'%',rate);assert.equal(actual.average.toFixed(1),avg);
 const reverse=H.h2h(s,b.id,a.id,row.mode);assert.equal(actual.wins,reverse.losses);assert.equal(actual.played,reverse.played);
}
for(const row of reference.probabilities){
 const a=[...s[row.mode].values()].find(p=>p.name===row.a),b=[...s[row.mode].values()].find(p=>p.name===row.b);
 close(H.probability(a.rating,b.rating),row.value,'workbook probability');
}
const ids=['Georges','Irving','Tuto','Waldemar'].map(H.playerId),teams=[ids.slice(0,2),ids.slice(2)];
const prediction=H.predict(s,teams);assert(prediction.probability>0&&prediction.probability<1);
close(prediction.probability+H.predict(s,teams.slice().reverse()).probability,1,'complement');
assert.equal(H.predict(s,[[H.playerId('David'),ids[0]],teams[1]]).probability,null);
assert.equal(H.predict(s,[teams[0],teams[0]]).probability,null);
assert.equal(H.probability(null,1),null);
assert.equal(s.players.get(H.playerId('Juan C')).played,6);
// Synthetic finals: 120-point target and a loser above 100 still count correctly.
const tiny={schemaVersion:1,ratingModel:H.MODEL,players:data.players.filter(p=>ids.includes(p.id)),events:[{id:'test',title:'Final',date:'2026-11-14',matches:[{id:'f',order:0,target:120,teams,score:[126,110]}]}]};
const final=H.summarize(H.validate(tiny));assert.equal(final.players.get(ids[0]).wins,1);assert.equal(final.players.get(ids[2]).lossAverage,110);
close(final.players.get(ids[0]).rating,0.5*126+0.25+0.05*126+0.1*126+0.1,'individual missing-loss fallback');
close(final.pairs.get(H.pairKey(teams[0])).rating,0.5*126+0.25+0.05*126+0.1*126,'pair missing-loss fallback');
const invalid=structuredClone(tiny);invalid.events[0].matches[0].score=[120,120];assert.throws(()=>H.validate(invalid));
invalid.events[0].matches[0].score=[-1,120];assert.throws(()=>H.validate(invalid));
invalid.events[0].matches[0].score=null;invalid.events[0].matches[0].teams[1][0]=ids[0];assert.throws(()=>H.validate(invalid));
const badDate=structuredClone(tiny);badDate.events[0].date='2026-02-30';assert.throws(()=>H.validate(badDate));
const duplicate=structuredClone(data);duplicate.events.push(duplicate.events[0]);assert.throws(()=>H.validate(duplicate));
const alias=structuredClone(data);alias.players[0].aliases=[alias.players[1].name];assert.throws(()=>H.validate(alias));
// Correcting and exporting an event repeatedly must replace, never append.
const event=structuredClone(data.events[0]);event.matches[0].score=[120,55];
const drafts={players:[],events:[{event,base:H.canonical(data.events[0])}]};
const merged=H.mergeDrafts(data,drafts);assert.equal(merged.conflicts.length,0);assert.equal(merged.data.events.length,16);assert.equal(H.summarize(merged.data).games.length,124);
assert.equal(H.mergeDrafts(merged.data,drafts).conflicts.length,0);
const changed=structuredClone(data);changed.events[0].matches[0].score=[130,67];assert.equal(H.mergeDrafts(changed,drafts).conflicts.length,1);
assert.equal(H.canonical(JSON.parse(JSON.stringify(merged.data))),H.canonical(merged.data));
// Legacy identity ignores score corrections; conversion preserves indices and empty games.
const state={title:'Example',players:['Georges','Irving','Tuto','Waldemar'],rounds:[{matches:[{teams:[[0,1],[2,3]],score:[104,0],table:1,wave:1}]}],playoffs:null};
const converted=H.eventFromState(state,data,{id:'example',date:'2026-11-14'});assert.equal(converted.players.length,27);assert.deepEqual(converted.event.matches[0].teams,teams);
state.rounds[0].matches[0].score=null;assert.equal(H.fingerprint(state),converted.event.legacyKey);
assert.equal(H.eventFromState(state,data,{id:'example',date:'2026-11-14'}).event.matches[0].score,null);
assert.equal([...s.players.values()].reduce((n,p)=>n+p.played,0),4*102);
assert.equal([...s.players.values()].reduce((n,p)=>n+p.wins,0),2*102);
console.log(`History checks passed: ${reference.players.length} player ratings, ${reference.pairs.length} pair ratings, ${reference.h2h.length} H2H cells, ${reference.probabilities.length} probabilities, and history validation/merge edge cases.`);
