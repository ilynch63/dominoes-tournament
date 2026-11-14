(function(root){
'use strict';
const MODEL='wednesday-workbook-v1';
const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const playerId=name=>'player-'+normalize(name).replace(/[^a-z0-9]+/g,'-');
const pairKey=team=>team.slice().sort().join('|');
const clone=x=>JSON.parse(JSON.stringify(x));
const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const textOK=(s,max=200)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
function validate(data){
 if(!data||data.schemaVersion!==1||data.ratingModel!==MODEL||!Array.isArray(data.players)||!Array.isArray(data.events))throw Error('Unsupported tournament history format or rating model.');
 const ids=new Set(),names=new Set(),events=new Set(),legacyKeys=new Set();
 for(const p of data.players){
  if(!textOK(p.id)||!textOK(p.name,70)||ids.has(p.id)||!Array.isArray(p.aliases??[]))throw Error('Invalid or duplicate player.');
  ids.add(p.id);
  for(const name of [p.name,...(p.aliases??[])]){if(!textOK(name,70)||names.has(normalize(name)))throw Error('Player names and aliases must be unique.');names.add(normalize(name));}
 }
 for(const e of data.events){
  if(!textOK(e.id)||events.has(e.id)||!textOK(e.title)||!dateOK(e.date)||!Array.isArray(e.matches))throw Error('Invalid or duplicate event.');
  events.add(e.id);const matches=new Set();
  if(e.legacyKey){if(typeof e.legacyKey!=='string'||legacyKeys.has(e.legacyKey))throw Error('The same tournament appears under multiple event IDs.');legacyKeys.add(e.legacyKey);}
  for(const m of e.matches){
   if(!textOK(m.id)||matches.has(m.id)||!Array.isArray(m.teams)||m.teams.length!==2||m.teams.some(t=>!Array.isArray(t)||t.length!==2)||new Set(m.teams.flat()).size!==4||m.teams.flat().some(id=>!ids.has(id)))throw Error('Invalid match participants in '+e.title+'.');
   matches.add(m.id);
   if(![100,120].includes(m.target)||!Number.isInteger(m.order)||m.order<0)throw Error('Invalid match target or order.');
   if(m.score!==null&&(!Array.isArray(m.score)||m.score.length!==2||m.score.some(n=>!Number.isInteger(n)||n<0||n>1000000)||Math.max(...m.score)<m.target||Math.min(...m.score)>=m.target))throw Error('Invalid match score in '+e.title+'.');
  }
 }
 if(data.defaultPlayers&&(!Array.isArray(data.defaultPlayers)||data.defaultPlayers.some(id=>!ids.has(id))))throw Error('Invalid default roster.');
 return data;
}
function blank(id,name,members){return {id,name,members,played:0,wins:0,losses:0,points:0,against:0,winPoints:0,lossPoints:0,events:new Set()};}
function record(s,score,other,event){s.played++;s.points+=score;s.against+=other;s.events.add(event);if(score>other){s.wins++;s.winPoints+=score;}else{s.losses++;s.lossPoints+=score;}}
function finish(s,pair=false){
 s.average=s.played?s.points/s.played:null;s.winRate=s.played?s.wins/s.played:null;s.winAverage=s.wins?s.winPoints/s.wins:null;s.lossAverage=s.losses?s.lossPoints/s.losses:null;
 // Exact weights from Estadisticas!M4:M9 and M14:M28. Individual missing-loss fallback is 1; pair fallback is 0.
 s.rating=s.played?0.5*s.average+0.25*s.winRate+0.05*s.points+0.1*(s.winAverage??0)+0.1*(s.lossAverage??(pair?0:1)):null;
 s.eventCount=s.events.size;delete s.events;return s;
}
const probability=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?1/(1+10**((b-a)/400)):null;
function summarize(data,filter={}){
 const players=new Map(data.players.map(p=>[p.id,blank(p.id,p.name)])),pairs=new Map(),games=[];
 for(const e of data.events.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
  if(filter.eventId&&e.id!==filter.eventId||filter.source&&e.source?.kind!==filter.source||filter.before&&e.date>=filter.before)continue;
  for(const m of e.matches.slice().sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))){
   if(!m.score)continue;games.push({...m,eventId:e.id,eventTitle:e.title,date:e.date});
   m.teams.forEach((t,i)=>{const key=pairKey(t);if(!pairs.has(key))pairs.set(key,blank(key,t.map(id=>players.get(id).name).sort().join(' + '),t.slice().sort()));record(pairs.get(key),m.score[i],m.score[1-i],e.id);t.forEach(id=>record(players.get(id),m.score[i],m.score[1-i],e.id));});
  }
 }
 players.forEach(p=>finish(p));pairs.forEach(p=>finish(p,true));
 for(const collection of [players,pairs])for(const p of collection.values()){
  const opponents=[...collection.values()].filter(q=>q.played&&q.id!==p.id&&(!p.members||!p.members.some(id=>q.members.includes(id))));
  p.expected=p.played&&opponents.length?opponents.reduce((sum,q)=>sum+probability(p.rating,q.rating),0)/opponents.length:null;
  p.woe=p.expected===null?null:p.winRate-p.expected;
 }
 return {players,pairs,games};
}
function h2h(summary,a,b,mode='players'){
 const result=blank('h2h','H2H');
 for(const m of summary.games){let side=-1;if(mode==='pairs'){side=m.teams.findIndex(t=>pairKey(t)===a);if(side<0||pairKey(m.teams[1-side])!==b)continue;}else{side=m.teams.findIndex(t=>t.includes(a));if(side<0||!m.teams[1-side].includes(b))continue;}record(result,m.score[side],m.score[1-side],m.eventId);}
 return finish(result,mode==='pairs');
}
function predict(summary,teams){
 if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>t.length!==2)||new Set(teams.flat()).size!==4)return {probability:null,reason:'Choose four different players.'};
 const pairs=teams.map(t=>summary.pairs.get(pairKey(t)));
 if(pairs.some(p=>!p?.played))return {probability:null,reason:'Unavailable until both partnerships have recorded games together.',games:pairs.map(p=>p?.played??0)};
 return {probability:probability(pairs[0].rating,pairs[1].rating),games:pairs.map(p=>p.played),ratings:pairs.map(p=>p.rating)};
}
function fingerprint(state){
 // Scores and playoff progress are deliberately excluded so corrections retain the same event identity.
 return JSON.stringify([normalize(state.title),state.players.map(normalize),state.rounds.map(r=>r.matches.map(m=>m.teams))]);
}
function eventFromState(state,data,metadata){
 if(!dateOK(metadata.date)||!textOK(metadata.id))throw Error('Choose an event date and identity.');
 const players=clone(data.players),lookup=new Map();for(const p of players)for(const n of [p.name,...(p.aliases??[])])lookup.set(normalize(n),p.id);
 const roster=state.players.map(name=>{const n=normalize(name);if(lookup.has(n))return lookup.get(n);let id=playerId(name);if(players.some(p=>p.id===id))throw Error('Player identity collision: '+name);players.push({id,name:name.trim(),aliases:[]});lookup.set(n,id);return id;});
 const matches=[];let order=0;
 const add=(m,id,stage,target=100)=>{if(!m)return;matches.push({id,order:order++,stage,target,teams:m.teams.map(t=>t.map(i=>roster[i])),score:m.score?m.score.slice():null,...(m.table?{table:m.table,wave:m.wave}:{})});};
 state.rounds.forEach((r,i)=>r.matches.forEach((m,j)=>add(m,`q-${i}-${j}`,`Qualifying ${i+1}`)));
 state.playoffs?.quarters?.forEach((m,i)=>add(m,`p-${i}`,'Quarterfinal'));
 state.playoffs?.semis?.forEach((m,i)=>add(m,`s-${i}`,'Semifinal'));
 if(state.playoffs?.final)add(state.playoffs.final,'f','Final',state.playoffs.final.target??(state.playoffs.final.score?100:120));
 const event={id:metadata.id,title:state.title,date:metadata.date,source:{kind:'app'},legacyKey:fingerprint(state),matches};
 validate({...data,players,events:[event]});return {players,event};
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function mergeDrafts(base,drafts){
 const data=clone(base),conflicts=[];
 for(const p of drafts.players??[]){const found=data.players.find(q=>q.id===p.id);if(!found)data.players.push(clone(p));else if(canonical(found)!==canonical(p))conflicts.push({id:p.id,type:'player',title:p.name});}
 for(const entry of drafts.events??[]){const index=data.events.findIndex(e=>e.id===entry.event.id),remote=index<0?null:data.events[index];
  if(canonical(remote)===canonical(entry.event))continue;
  if(canonical(remote)!==entry.base)conflicts.push({id:entry.event.id,type:'event',title:entry.event.title});
  if(index<0)data.events.push(clone(entry.event));else data.events[index]=clone(entry.event);
 }
 data.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));validate(data);return {data,conflicts};
}
const api={MODEL,normalize,playerId,pairKey,validate,summarize,h2h,predict,probability,fingerprint,eventFromState,canonical,mergeDrafts,dateOK};
if(typeof module!=='undefined')module.exports=api;else root.DominoHistory=api;
})(typeof window!=='undefined'?window:globalThis);
