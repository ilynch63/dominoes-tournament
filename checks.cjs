const assert=require('node:assert/strict');
const D=require('./core.js');
let schedules=0;
for(let n=8;n<=48;n++){
 const rounds=D.schedule(n,6),byes=Array(n).fill(0),pairs=new Set();
 for(const r of rounds){const all=r.matches.flatMap(m=>m.teams.flat()).concat(r.byes);assert.equal(new Set(all).size,n);assert.equal(all.length,n);r.byes.forEach(p=>byes[p]++);for(const m of r.matches){assert(m.table<=6);for(const t of m.teams){const key=t.slice().sort((a,b)=>a-b).join(':');assert(!pairs.has(key),`Repeated partner at ${n}`);pairs.add(key);}}}
 assert(Math.max(...byes)-Math.min(...byes)<=1);
 assert.equal(rounds.length,n%4===0?4:n===11?6:5);
 const s={version:3,title:'Test event',players:Array.from({length:n},(_,i)=>`Player ${i+1}`),tables:6,rounds,playoffs:null};
 D.validate(s);rounds.forEach(r=>r.matches.forEach(m=>m.score=[108,75]));
 const rows=D.standings(s);assert.equal(rows.reduce((t,p)=>t+p.points,0),rounds.flatMap(r=>r.matches).length*2*(108+75));
 assert(rows.every(p=>p.played===rounds.length-byes[p.id]&&p.played===4));
 const prior=Array(n).fill(0);
 for(const r of rounds)for(const m of r.matches)for(const id of m.teams.flat()){assert(prior[id]<4,'Nobody gets a fifth game');prior[id]++;}
 assert.equal(rounds.at(-1).matches.length,n%Math.floor(n/4)||Math.floor(n/4),'Final round uses only needed tables');
 assert(D.complete(s));
 const legacy={...s,version:1,rounds:JSON.parse(JSON.stringify(rounds.slice(0,3)))};
 D.validate(legacy);assert(D.needsExtension(legacy));assert(!D.complete(legacy));assert.throws(()=>D.createPlayoffs(legacy));
 const legacyBefore=JSON.stringify(legacy),extended=D.schedule(n,6,legacy.rounds);
 assert.equal(JSON.stringify(legacy),legacyBefore,'Extending must not mutate the old event');
 assert.deepEqual(extended.slice(0,3),legacy.rounds,'Existing matches and scores must be preserved');
 const upgraded={...legacy,version:3,rounds:extended};D.validate(upgraded);assert(!D.complete(upgraded));
 extended.slice(3).forEach(r=>r.matches.forEach(m=>m.score=[107,74]));assert(D.complete(upgraded));
 if(n<16){assert.throws(()=>D.createPlayoffs(s),/At least 16/);schedules++;continue;}
 s.playoffs=D.createPlayoffs(s);D.validate(s);
 const p=s.playoffs,seed=p.seeds;
 assert.deepEqual(p.quarters.map(m=>m.teams),[[[seed[0],seed[1]],[seed[14],seed[15]]],[[seed[6],seed[7]],[seed[8],seed[9]]],[[seed[2],seed[3]],[seed[12],seed[13]]],[[seed[4],seed[5]],[seed[10],seed[11]]]]);
 assert.equal(new Set(p.quarters.flatMap(m=>m.teams.flat())).size,16);
 assert.deepEqual(p.semis,[null,null]);assert.equal(p.final,null);
 p.quarters.forEach((m,i)=>{m.score=i%2?[91,111]:[108,75];D.syncQuarter(p,i);D.validate(JSON.parse(JSON.stringify(s)));});
 assert.deepEqual(p.semis[0].teams,[p.quarters[0].teams[0],p.quarters[1].teams[1]]);
 assert.deepEqual(p.semis[1].teams,[p.quarters[2].teams[0],p.quarters[3].teams[1]]);
 p.semis[0].score=[108,75];D.syncFinal(p);assert.equal(p.final,null);D.validate(s);
 p.semis[1].score=[91,111];D.syncFinal(p);assert.deepEqual(p.final.teams,[p.semis[0].teams[0],p.semis[1].teams[1]]);
 assert.equal(p.final.target,120);assert.equal(D.finalTarget(p),120);
 p.final.score=[119,80];assert.throws(()=>D.validate(s));p.final.score=[120,120];assert.throws(()=>D.validate(s));
 p.final.score=[120,119];D.validate(JSON.parse(JSON.stringify(s)));
 const otherSemi=JSON.stringify(p.semis[1]);p.quarters[0].score=[70,100];D.syncQuarter(p,0);
 assert.equal(p.semis[0].score,null);assert.equal(p.final,null);assert.equal(JSON.stringify(p.semis[1]),otherSemi);D.validate(s);
 assert.deepEqual(p.semis[0].teams[0],p.quarters[0].teams[1]);
 p.semis[0].score=[100,0];D.syncFinal(p);p.final.score=[125,110];p.semis[1].score=[100,70];D.syncFinal(p);assert.equal(p.final.score,null);D.validate(s);
 const corrupt=JSON.parse(JSON.stringify(s));corrupt.playoffs.quarters[0].teams.reverse();assert.throws(()=>D.validate(corrupt));
 const missing=JSON.parse(JSON.stringify(s));missing.playoffs.semis[0]=null;assert.throws(()=>D.validate(missing));
 const wrongFinal=JSON.parse(JSON.stringify(s));wrongFinal.playoffs.final.teams.reverse();assert.throws(()=>D.validate(wrongFinal));
 schedules++;
}
assert(D.validScore(120,119,120));assert(D.validScore(110,125,120));assert(D.validScore(0,120,120));
for(const score of [[119,80],[120,120],[125,121],[-1,120],[120.5,0],[Infinity,0]])assert(!D.validScore(...score,120));
assert(!D.validScore(120,110),'earlier rounds still require a loser below 100');
assert(D.validScore(108,75));assert(D.validScore(0,100));for(const pair of [[100,100],[99,75],[-1,100],[100.1,75],[Infinity,0]])assert(!D.validScore(...pair));
assert(D.compare({wins:2,played:2,points:205},{wins:2,played:3,points:300})<0,'win percentage has priority');
assert.equal(D.compare({wins:2,played:2,points:210},{wins:3,played:3,points:315}),0,'exact ratio ties');
assert(D.compare({wins:2,played:3,points:271},{wins:2,played:3,points:270})<0,'full point precision');
const tied={version:3,title:'Tie',players:Array.from({length:16},(_,i)=>`P${i}`),tables:2,rounds:D.schedule(16,2),playoffs:null};
assert.throws(()=>D.createPlayoffs(tied));tied.rounds.forEach(r=>r.matches.forEach(m=>m.score=[100,99]));tied.playoffs=D.createPlayoffs(tied);const before=JSON.stringify(tied.playoffs);D.standings(tied);D.standings(tied);assert.equal(JSON.stringify(tied.playoffs),before,'standings do not redraw');
const bad=JSON.parse(JSON.stringify(tied));bad.rounds[0].matches[0].teams[0][0]=999;assert.throws(()=>D.validate(bad));
const legacyFixture=require('./test-fixtures/legacy-21.json');D.validate(legacyFixture);
assert(D.needsExtension(legacyFixture));
for(const scored of [0,1,7,20]){
 const event=JSON.parse(JSON.stringify(legacyFixture));event.rounds.flatMap(r=>r.matches).slice(0,scored).forEach(m=>m.score=[109,70]);
 const snapshot=JSON.stringify(event),recorded=event.rounds.flatMap(r=>r.matches).filter(m=>m.score);
 const rounds=D.rebalance(event),updated={...event,version:3,rounds};
 assert.equal(JSON.stringify(event),snapshot,'Rebalancing cannot mutate the saved event');D.validate(updated);
 assert.deepEqual(rounds.flatMap(r=>r.matches).filter(m=>m.score),recorded,'Keep every scored match, pairing, table, wave and result');
 assert(D.scheduledCounts(updated).every(v=>v===4));
 if(scored===20){assert.equal(rounds.at(-1).matches.length,1);assert.equal(rounds.at(-1).byes.length,17);}
 const invalid={...updated,rounds:rounds.slice(0,-1)};assert.throws(()=>D.validate(invalid));assert(!D.complete(invalid));
}
const playedFive=JSON.parse(JSON.stringify(legacyFixture));playedFive.rounds.forEach(r=>r.matches.forEach(m=>m.score=[100,70]));D.validate(playedFive);
assert(!D.complete(playedFive));assert.throws(()=>D.createPlayoffs(playedFive));
const snapshot=JSON.stringify(playedFive);assert.throws(()=>D.rebalance(playedFive),/more than four/);assert.equal(JSON.stringify(playedFive),snapshot);
const oneTable={...tied,players:tied.players.slice(0,8),rounds:D.schedule(8,1),tables:1,playoffs:null};D.validate(oneTable);assert(oneTable.rounds.every(r=>r.matches.every(m=>m.table===1)&&r.matches[1].wave===2));
const old=JSON.parse(JSON.stringify(tied)),seeds=old.playoffs.seeds;
old.playoffs={...old.playoffs,semis:[{teams:[[seeds[0],seeds[7]],[seeds[3],seeds[4]]],score:[100,70]},{teams:[[seeds[1],seeds[6]],[seeds[2],seeds[5]]],score:[70,100]}],final:null};
delete old.playoffs.quarters;D.syncFinal(old.playoffs);delete old.playoffs.final.target;old.playoffs.final.score=[100,80];D.validate(old);
assert.equal(D.finalTarget(old.playoffs),100);old.playoffs.final.score=null;assert.equal(D.finalTarget(old.playoffs),120);D.validate(old);D.syncFinal(old.playoffs);assert.equal(old.playoffs.final.target,120);
const draw=JSON.stringify(old.playoffs.draws);Object.assign(old.playoffs,D.playoffBracket(seeds));D.validate(old);assert.equal(JSON.stringify(old.playoffs.draws),draw);assert.deepEqual(old.playoffs.seeds,seeds);
const previous=JSON.parse(JSON.stringify(tied));Object.assign(previous.playoffs,D.playoffBracket(previous.playoffs.seeds,'high-low'));delete previous.playoffs.pairing;
D.validate(previous);previous.playoffs.quarters.forEach((m,i)=>{m.score=[100,70];D.syncQuarter(previous.playoffs,i);});D.validate(previous);
const savedOrder=JSON.stringify(previous.playoffs.seeds),savedDraw=JSON.stringify(previous.playoffs.draws);
Object.assign(previous.playoffs,D.playoffBracket(previous.playoffs.seeds));D.validate(previous);
assert.equal(previous.playoffs.pairing,'adjacent');assert.equal(JSON.stringify(previous.playoffs.seeds),savedOrder);assert.equal(JSON.stringify(previous.playoffs.draws),savedDraw);assert.deepEqual(previous.playoffs.semis,[null,null]);assert.equal(previous.playoffs.final,null);
const badFormat=JSON.parse(JSON.stringify(previous));badFormat.playoffs.pairing='unknown';assert.throws(()=>D.validate(badFormat));
const byeFixture={version:3,title:'Bye switch checks',players:Array.from({length:9},(_,i)=>`P${i}`),tables:2,playoffs:null,
 rounds:[
  {byes:[0],teams:[[[5,2],[8,6]],[[4,3],[1,7]]]},
  {byes:[6],teams:[[[1,3],[5,0]],[[2,7],[4,8]]]},
  {byes:[8],teams:[[[4,1],[0,2]],[[3,6],[7,5]]]},
  {byes:[7],teams:[[[3,2],[6,1]],[[8,0],[4,5]]]},
  {byes:[5,3,2,4,1],teams:[[[6,0],[8,7]]]}
 ].map(r=>({byes:r.byes,matches:r.teams.map((teams,i)=>({teams,score:null,table:i+1,wave:1}))}))};
D.validate(byeFixture);
let byeSuccesses=0,byeRejections=0;
for(let ri=0;ri<byeFixture.rounds.length;ri++)for(const incoming of byeFixture.rounds[ri].byes)for(const out of byeFixture.rounds[ri].matches.flatMap(m=>m.teams.flat())){
 const event=JSON.parse(JSON.stringify(byeFixture));
 event.rounds.slice(0,ri).forEach(r=>r.matches.forEach(m=>m.score=[108,70]));
 const untouched=event.rounds[ri].matches.find(m=>!m.teams.flat().includes(out));
 if(untouched)untouched.score=[100,65];
 const before=JSON.stringify(event);let rounds;
 try{rounds=D.switchBye(event,ri,out,incoming);}catch(e){
   assert.match(e.message,/repeat a teammate|already has four|cannot be completed|Could not find a rotation/);byeRejections++;
 }
 assert.equal(JSON.stringify(event),before,'Bye review must never mutate the saved event');
 if(!rounds)continue;
 const updated={...event,rounds};D.validate(JSON.parse(JSON.stringify(updated)));
 assert(D.scheduledCounts(updated).every(n=>n===4));
 assert.deepEqual(rounds.slice(0,ri),event.rounds.slice(0,ri),'Earlier rounds stay unchanged');
 assert(rounds[ri].byes.includes(out));assert(!rounds[ri].byes.includes(incoming));
 event.rounds[ri].matches.forEach((m,j)=>assert.deepEqual(rounds[ri].matches[j],{...m,teams:m.teams.map(t=>t.map(id=>id===out?incoming:id))}));
 assert.deepEqual(rounds.flatMap(r=>r.matches).filter(m=>m.score),event.rounds.flatMap(r=>r.matches).filter(m=>m.score),'All saved results keep their original players');
 byeSuccesses++;
}
assert(byeSuccesses>0);assert(byeRejections>0);
assert.throws(()=>D.switchBye(byeFixture,1,4,6),/repeat a teammate/);
assert.throws(()=>D.switchBye(byeFixture,0,5,1),/has a bye/);
assert.throws(()=>D.switchBye(byeFixture,0,0,0),/no saved result/);
assert.throws(()=>D.switchBye(byeFixture,-1,5,0),/has a bye/);
const lockedBye=JSON.parse(JSON.stringify(byeFixture));lockedBye.rounds[0].matches[0].score=[100,0];
assert.throws(()=>D.switchBye(lockedBye,0,5,0),/no saved result/);
lockedBye.rounds[0].matches[0].score=null;lockedBye.rounds[2].matches[0].score=[100,0];
assert.throws(()=>D.switchBye(lockedBye,0,5,0),/Later rounds/);
console.log(`PASS: ${schedules} attendance counts (8–48), exactly four games, reduced final rounds, unique teammates, legacy/partial-result migration, preserved results, playoff eligibility, scoring, ranking, backups, and bye switches (${byeSuccesses} valid, ${byeRejections} safely rejected).`);
