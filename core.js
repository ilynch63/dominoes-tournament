/* Tournament calculations shared by the standalone app and its checks. */
(function(root){
'use strict';
const randomInt = n => { const a=new Uint32Array(1); const limit=4294967296-(4294967296%n); do{crypto.getRandomValues(a);}while(a[0]>=limit); return a[0]%n; };
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a; }
const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const MIN_MATCHES=4;
function requiredRounds(n){return Math.ceil(MIN_MATCHES*n/(4*Math.floor(n/4)));}
function scheduledCounts(s){const counts=Array(s.players.length).fill(0);for(const r of s.rounds)for(const m of r.matches)for(const i of m.teams.flat())counts[i]++;return counts;}
function needsExtension(s){return s.rounds.length>0&&scheduledCounts(s).some(n=>n!==MIN_MATCHES);}
// Havel-Hakimi assigns the largest remaining player needs to each round.
// Check bipartite degree feasibility before choosing participants.
function roundSizes(need,n){
 const total=need.reduce((a,b)=>a+b,0),matches=total/4,capacity=Math.floor(n/4);
 if(!total)return [];
 if(total%4||Math.max(...need)>matches)throw Error('The recorded results cannot be completed to exactly four games each. Export a backup and start a new event; no results have been changed.');
 const feasible=sizes=>{const degrees=need.slice().sort((a,b)=>b-a);let sum=0;return degrees.every((d,i)=>{sum+=d;return sum<=sizes.reduce((v,c)=>v+Math.min(i+1,c),0);});};
 const packed=Array(Math.floor(matches/capacity)).fill(capacity*4);if(matches%capacity)packed.push(matches%capacity*4);
 if(feasible(packed))return packed;
 for(let r=Math.max(Math.max(...need),Math.ceil(matches/capacity));r<=matches;r++){
   const sizes=Array.from({length:r},(_,i)=>4*(Math.floor(matches/r)+(i<matches%r?1:0)));
   if(feasible(sizes))return sizes;
 }
 throw Error('Unable to arrange the remaining games. No results have been changed.');
}
function schedule(n,tables=6,existing=[]){
 let lastError;
 for(let attempt=0;attempt<60;attempt++){
   try{return scheduleAttempt(n,tables,existing);}catch(e){if(!e.retryRotation)throw e;lastError=e;}
 }
 throw lastError;
}
function scheduleAttempt(n,tables=6,existing=[]){
 if(!Number.isInteger(n)||n<8||n>48)throw Error('Use 8 to 48 players.');
 if(!Number.isInteger(tables)||tables<1||tables>12)throw Error('Use 1 to 12 tables.');
 const rounds=JSON.parse(JSON.stringify(existing)), met={}, partnered={}, played=Array(n).fill(0);
 for(const round of rounds){for(const m of round.matches){const g=m.teams.flat();g.forEach(i=>played[i]++);for(let j=0;j<4;j++)for(let k=j+1;k<4;k++)met[key(g[j],g[k])]=(met[key(g[j],g[k])]||0)+1;for(const team of m.teams)partnered[key(...team)]=1;}}
 function bestPair(g){
   const patterns=[[g[0],g[1],g[2],g[3]],[g[0],g[2],g[1],g[3]],[g[0],g[3],g[1],g[2]]];
   return patterns.map(p=>({p,c:(partnered[key(p[0],p[1])]||0)+(partnered[key(p[2],p[3])]||0)})).sort((a,b)=>a.c-b.c)[0];
 }
 function cost(a){let c=0; for(let i=0;i<a.length;i+=4){const g=a.slice(i,i+4);c+=bestPair(g).c*10000;for(let j=0;j<4;j++)for(let k=j+1;k<4;k++)c+=(met[key(g[j],g[k])]||0)**2;}return c;}
 const need=played.map(v=>MIN_MATCHES-v);
 if(need.some(v=>v<0))throw Error('Some players already have more than four recorded games. Their results are kept. Export a backup and start a new event to use equal four-game qualifying.');
 const sizes=roundSizes(need,n);
 for(const size of sizes){
   const pool=shuffle(Array.from({length:n},(_,i)=>i)).sort((a,b)=>need[b]-need[a]);
   const active=pool.slice(0,size),byes=pool.slice(size);
   if(active.some(i=>need[i]<=0))throw Error('Unable to assign equal games. No results have been changed.');
   active.forEach(i=>need[i]--);
   let best=shuffle(active), bestCost=cost(best), a=best.slice(), c=bestCost;
   for(let step=0;step<7000 && bestCost>0 && best.length>4;step++){
     const i=randomInt(a.length),j=randomInt(a.length);[a[i],a[j]]=[a[j],a[i]];
     const next=cost(a),temp=Math.max(.08,2*(1-step/7000));
     if(next<=c || Math.random()<Math.exp((c-next)/temp)){c=next;if(c<bestCost){best=a.slice();bestCost=c;}}
     else [a[i],a[j]]=[a[j],a[i]];
   }
   if(bestCost>=10000){const error=Error('Could not find a rotation without repeat partners. Please try again. Your saved event is unchanged.');error.retryRotation=true;throw error;}
   const matches=[];
   for(let i=0;i<best.length;i+=4){const g=bestPair(best.slice(i,i+4)).p;
     for(let j=0;j<4;j++)for(let k=j+1;k<4;k++)met[key(g[j],g[k])]=(met[key(g[j],g[k])]||0)+1;
     for(const [a,b] of [[g[0],g[1]],[g[2],g[3]]])partnered[key(a,b)]=1;
     const m=i/4;matches.push({teams:[g.slice(0,2),g.slice(2)],score:null,table:m%tables+1,wave:Math.floor(m/tables)+1});
   }
   rounds.push({byes,matches});
 }
 return rounds;
}
// Keep scored matches in their original round/table slots; rebuild only unplayed games.
function rebalance(state){
 const n=state.players.length;
 const kept=state.rounds.map(r=>{const matches=r.matches.filter(m=>m.score),active=new Set(matches.flatMap(m=>m.teams.flat()));return {matches,byes:Array.from({length:n},(_,i)=>i).filter(i=>!active.has(i))};}).filter(r=>r.matches.length);
 return schedule(n,state.tables,kept);
}
// Exchange a seat and a bye without changing any recorded match.
function switchBye(state,roundIndex,restingPlayer,replacement){
 validate(state);
 if(state.playoffs||needsExtension(state))throw Error('Finish updating qualifying before switching a bye.');
 const round=state.rounds[roundIndex];
 if(!Number.isInteger(roundIndex)||!round||!round.byes.includes(replacement))throw Error('Choose a player who has a bye in this round.');
 const match=round.matches.find(m=>m.teams.flat().includes(restingPlayer));
 if(!match||match.score)throw Error('Choose a player in a match with no saved result.');
 if(state.rounds.slice(roundIndex+1).some(r=>r.matches.some(m=>m.score)))throw Error('Later rounds already have saved results. Their schedule cannot be changed.');
 const rounds=JSON.parse(JSON.stringify(state.rounds));
 const exchange=(r,out,incoming)=>{
   r.byes=r.byes.map(id=>id===incoming?out:id);
   r.matches.forEach(m=>m.teams=m.teams.map(t=>t.map(id=>id===out?incoming:id)));
 };
 exchange(rounds[roundIndex],restingPlayer,replacement);
 const kept=rounds.slice(0,roundIndex+1),pairs=new Set();
 for(const r of kept)for(const m of r.matches)for(const t of m.teams){
   const pair=key(...t);
   if(pairs.has(pair))throw Error('This switch would repeat a teammate. Choose a different player with a bye.');
   pairs.add(pair);
 }
 const counts=scheduledCounts({...state,rounds:kept});
 if(counts.some(c=>c>MIN_MATCHES))throw Error('That player already has four games. Choose a different player with a bye.');
 // Prefer a reciprocal switch later so the rest of the schedule stays intact.
 for(let i=roundIndex+1;i<rounds.length;i++){
   if(!rounds[i].byes.includes(restingPlayer)||rounds[i].byes.includes(replacement))continue;
   const candidate=JSON.parse(JSON.stringify(rounds));
   exchange(candidate[i],replacement,restingPlayer);
   try{validate({...state,version:3,rounds:candidate});return candidate;}catch{}
 }
 // Rebuild only later rounds if a reciprocal switch would repeat a teammate.
 const rebuilt=schedule(state.players.length,state.tables,kept);
 validate({...state,version:3,rounds:rebuilt});
 return rebuilt;
}
function validScore(a,b,target=100){return Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&Math.max(a,b)>=target&&Math.min(a,b)<target&&Math.max(a,b)<=1000000;}
function compare(a,b){return b.wins*a.played-a.wins*b.played || b.points*a.played-a.points*b.played;}
function standings(state){
 const rows=state.players.map((name,id)=>({id,name,wins:0,points:0,played:0,byes:0}));
 for(const round of state.rounds){round.byes.forEach(i=>rows[i].byes++);for(const m of round.matches){if(!m.score)continue;m.teams.forEach((team,t)=>team.forEach(i=>{rows[i].played++;rows[i].points+=m.score[t];if(m.score[t]>m.score[1-t])rows[i].wins++;}));}}
 const order=state.playoffs?.seeds||[];
 return rows.sort((a,b)=>{
   if(!a.played||!b.played)return b.played-a.played||a.id-b.id;
   return compare(a,b)||(order.length?order.indexOf(a.id)-order.indexOf(b.id):a.id-b.id);
 });
}
const complete=s=>s.rounds.length>0&&s.rounds.every(r=>r.matches.every(m=>m.score))&&standings(s).every(p=>p.played===MIN_MATCHES);
function createPlayoffs(state){
 if(state.players.length<16)throw Error('At least 16 players are required for the three-round playoffs.');
 if(!complete(state))throw Error('Finish all qualifying matches; every player must play exactly four before playoffs.');
 const rows=standings({...state,playoffs:null}),seeds=[],draws=[];
 for(let i=0;i<rows.length;){let j=i+1;while(j<rows.length&&compare(rows[i],rows[j])===0)j++;
   const group=rows.slice(i,j).map(p=>p.id),order=group.length>1?shuffle(group):group;
   if(group.length>1)draws.push({firstRank:i+1,order});seeds.push(...order);i=j;
 }
 return {...playoffBracket(seeds),seeds,draws,created:new Date().toISOString()};
}
function playoffBracket(seeds,pairing='adjacent'){
 if(seeds.length<16)throw Error('At least 16 players are required for the three-round playoffs.');
 if(!['adjacent','high-low'].includes(pairing))throw Error('Invalid playoff pairing format.');
 const team=rank=>pairing==='adjacent'?[seeds[2*rank-2],seeds[2*rank-1]]:[seeds[rank-1],seeds[16-rank]];
 return {pairing,quarters:[[1,8],[4,5],[2,7],[3,6]].map(ranks=>({teams:ranks.map(team),score:null})),semis:[null,null],final:null};
}
const winner=m=>m.teams[m.score[0]>m.score[1]?0:1];
// Completed finals without a target were saved under the original 100-point rule.
const finalTarget=p=>p.final?.target??(p.final?.score?100:120);
function syncFinal(p){if(p.semis.every(m=>m?.score))p.final={teams:p.semis.map(winner),score:null,target:120};else p.final=null;}
function syncQuarter(p,index){
 const semi=Math.floor(index/2),matches=p.quarters.slice(semi*2,semi*2+2);
 p.semis[semi]=matches.every(m=>m.score)?{teams:matches.map(winner),score:null}:null;
 syncFinal(p);
}
function validate(s){
 if(!s||![1,2,3].includes(s.version)||!Array.isArray(s.players)||s.players.length<8||s.players.length>48||s.players.some(n=>typeof n!=='string'||!n.trim()||n.length>70)||new Set(s.players.map(n=>n.trim().toLowerCase())).size!==s.players.length)throw Error('Invalid player list in backup.');
 if(typeof s.title!=='string'||s.title.length>100||!Number.isInteger(s.tables)||s.tables<1||s.tables>12||!Array.isArray(s.rounds)||(s.version<3?![0,s.version===1?3:requiredRounds(s.players.length)].includes(s.rounds.length):s.rounds.length>s.players.length))throw Error('Invalid event settings.');
 const n=s.players.length,partner=new Set(),byeCount=Array(n).fill(0);
 function match(m,target=100){if(!m||!Array.isArray(m.teams)||m.teams.length!==2||m.teams.some(t=>!Array.isArray(t)||t.length!==2)||new Set(m.teams.flat()).size!==4||m.teams.flat().some(i=>!Number.isInteger(i)||i<0||i>=n)||!(m.score===null||(Array.isArray(m.score)&&m.score.length===2&&validScore(...m.score,target))))throw Error('Invalid match in backup.');}
 for(const r of s.rounds){if(!Array.isArray(r.byes)||!Array.isArray(r.matches)||(s.version<3&&(r.byes.length!==n%4||r.matches.length!==Math.floor(n/4)))||r.matches.length<1||r.matches.length>Math.floor(n/4))throw Error('Invalid round in backup.');const seen=r.byes.slice();
   r.byes.forEach(i=>{if(!Number.isInteger(i)||i<0||i>=n)throw Error('Invalid bye.');byeCount[i]++;});
   for(const m of r.matches){match(m);if(!Number.isInteger(m.table)||m.table<1||m.table>s.tables||!Number.isInteger(m.wave)||m.wave<1)throw Error('Invalid table.');seen.push(...m.teams.flat());for(const t of m.teams){const k=key(...t);if(partner.has(k))throw Error('Repeated partner in backup.');partner.add(k);}}
   if(seen.length!==n||new Set(seen).size!==n)throw Error('Players missing or duplicated in a round.');
 }
 if(s.version<3&&Math.max(...byeCount)-Math.min(...byeCount)>1)throw Error('Unbalanced byes.');
 if(s.version===2&&s.rounds.length&&scheduledCounts(s).some(v=>v<MIN_MATCHES))throw Error('The schedule does not give every player four matches.');
 if(s.version===3&&needsExtension(s))throw Error('The schedule must give every player exactly four matches.');
 const legacyComplete=s.version<3&&s.rounds.length>0&&s.rounds.every(r=>r.matches.every(m=>m.score));
 if(s.playoffs){const p=s.playoffs;if(!(complete(s)||legacyComplete)||!Array.isArray(p.seeds)||p.seeds.length!==n||new Set(p.seeds).size!==n||p.seeds.some(i=>!Number.isInteger(i)||i<0||i>=n)||!Array.isArray(p.draws)||!Array.isArray(p.semis)||p.semis.length!==2)throw Error('Invalid playoffs.');
   const rows=standings({...s,playoffs:null}),byId=Object.fromEntries(rows.map(r=>[r.id,r]));for(let i=1;i<n;i++)if(compare(byId[p.seeds[i-1]],byId[p.seeds[i]])>0)throw Error('Invalid seeding order.');
   function nextMatch(m,previous,label,target=100){
     if(previous.every(m=>m?.score)){match(m,target);if(JSON.stringify(m.teams)!==JSON.stringify(previous.map(winner)))throw Error(`Invalid ${label} teams.`);}
     else if(m!==null)throw Error(`Unexpected ${label}.`);
   }
   if(Object.hasOwn(p,'quarters')){
     if(n<16||!Array.isArray(p.quarters)||p.quarters.length!==4)throw Error('Invalid quarterfinals.');
     const expected=playoffBracket(p.seeds,p.pairing===undefined?'high-low':p.pairing).quarters;
     p.quarters.forEach((m,i)=>{match(m);if(JSON.stringify(m.teams)!==JSON.stringify(expected[i].teams))throw Error('Invalid quarterfinal teams.');});
     p.semis.forEach((m,i)=>nextMatch(m,p.quarters.slice(i*2,i*2+2),'semifinal'));
   }else{
     const expected=[[[p.seeds[0],p.seeds[7]],[p.seeds[3],p.seeds[4]]],[[p.seeds[1],p.seeds[6]],[p.seeds[2],p.seeds[5]]]];
     p.semis.forEach((m,i)=>{match(m);if(JSON.stringify(m.teams)!==JSON.stringify(expected[i]))throw Error('Invalid semifinal teams.');});
   }
   p.draws.forEach(d=>{if(!Number.isInteger(d.firstRank)||!Array.isArray(d.order)||d.order.length<2||JSON.stringify(p.seeds.slice(d.firstRank-1,d.firstRank-1+d.order.length))!==JSON.stringify(d.order))throw Error('Invalid draw record.');});
   if(p.final?.target!==undefined&&p.final.target!==120)throw Error('Invalid championship target.');
   nextMatch(p.final,p.semis,'final',finalTarget(p));
 }
 return s;
}
const api={MIN_MATCHES,requiredRounds,scheduledCounts,needsExtension,shuffle,schedule,rebalance,switchBye,validScore,compare,standings,complete,createPlayoffs,playoffBracket,syncQuarter,syncFinal,finalTarget,validate};
if(typeof module!=='undefined')module.exports=api;else root.Domino=api;
})(typeof window!=='undefined'?window:globalThis);
