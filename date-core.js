(function(root){
'use strict';
const KEY='domino-date-data-v1',TYPES=['Endless Bonchones','Wednesday Group'];
const clone=value=>JSON.parse(JSON.stringify(value));
function validate(data){
 if(!data||data.schemaVersion!==1||!Array.isArray(data.dates))throw Error('Invalid domino date data.');
 const dates=new Set();
 for(const event of data.dates){
  if(typeof event.id!=='string'||!event.id||dates.has(event.id)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(event.date)||!TYPES.includes(event.type)||typeof event.description!=='string'||!Array.isArray(event.games))throw Error('Invalid or duplicate domino date.');
  dates.add(event.id);const games=new Set();
  for(const game of event.games){
   if(typeof game.id!=='string'||!game.id||games.has(game.id)||!Array.isArray(game.team1)||game.team1.length!==2||!Array.isArray(game.team2)||game.team2.length!==2||[...game.team1,...game.team2].some(id=>typeof id!=='string')||![game.score1,game.score2].every(score=>score===null||(Number.isInteger(score)&&score>=0&&score<=1000000)))throw Error('Invalid game in '+event.date+'.');
   games.add(game.id);
  }
 }
 return data;
}
function load(){
 const seed=clone(JSON.parse(document.getElementById('dateDataSeed').textContent));
 try{const raw=localStorage.getItem(KEY);if(raw)return validate(JSON.parse(raw));}catch{}
 return validate(seed);
}
function persist(data){validate(data);localStorage.setItem(KEY,JSON.stringify(data));}
function historyEvents(data){
 return data.dates.map(event=>({id:event.id,title:event.type,eventType:event.type,description:event.description,date:event.date,source:{kind:event.type==='Wednesday Group'?'workbook':'endless-bonchones',file:event.type==='Wednesday Group'?'Wed.xlsm':'EB.xlsm'},matches:event.games.flatMap((game,order)=>{
  const participants=[...game.team1,...game.team2];
  if(participants.some(id=>!id)||new Set(participants).size!==4)return [];
  const scored=game.score1!==null&&game.score2!==null&&Math.max(game.score1,game.score2)>=100&&Math.min(game.score1,game.score2)<100;
  return [{id:game.id,order,stage:'Game',target:100,teams:[game.team1,game.team2],score:scored?[game.score1,game.score2]:null}];
 })}));
}
root.DominoDates={KEY,TYPES,validate,load,persist,historyEvents};
})(window);
