'use strict';
const H=DominoHistory,HISTORY_KEY='domino-history-drafts-v1';
let historyBase=H.validate(JSON.parse(document.getElementById('historySeed').textContent));
let historyDrafts={players:[],events:[]},historyData=historyBase,historyConflicts=[],historyError='',historyStatus='Bundled history',historyTab='players',historySource='',historyEvent='',historySearch='',historyMin=0,historySort='rating',historyMode='players',historyA='',historyB='',matchupIds=[],pendingHistoryState=null;
let historySummary,historyLiveSummary,historyLoading=false,historyStorageError=false,historyStoredRaw=null;
try{historyStoredRaw=localStorage.getItem(HISTORY_KEY);if(historyStoredRaw){historyDrafts=JSON.parse(historyStoredRaw);if(!Array.isArray(historyDrafts.players)||!Array.isArray(historyDrafts.events))throw Error('Invalid draft');}}catch{historyError='Saved history drafts could not be loaded. Export or recover your browser data before making history changes.';historyStorageError=true;}
function rebuildHistory(){
 try{const merged=H.mergeDrafts(historyBase,historyDrafts);historyData=merged.data;historyConflicts=merged.conflicts;historySummary=H.summarize(historyData);}
 catch(e){historyError=e.message;historySummary=H.summarize(historyBase);historyData=historyBase;}
}
rebuildHistory();
const historyNames=ids=>ids.map(id=>historyData.players.find(p=>p.id===id)?.name??id).join(' + ');
const historyNumber=(n,d=1)=>n===null||n===undefined?'—':n.toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const historyPercent=n=>n===null||n===undefined?'—':historyNumber(n*100)+'%';
function localDay(value=new Date()){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function matchingHistoryEvent(s){return historyData.events.find(e=>e.id===s.historyId)||historyData.events.find(e=>e.legacyKey===H.fingerprint(s));}
async function refreshHistory(){
 if(location.protocol==='file:'){historyStatus='Bundled history · offline file';return;}
 historyLoading=true;
 try{const response=await fetch('dominos-tournament-data.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('HTTP '+response.status);const data=H.validate(await response.json());historyBase=data;historyStatus='Loaded from dominos-tournament-data.json';rebuildHistory();}
 catch(e){historyStatus='Bundled history · refresh failed';tell('Could not refresh shared history. The bundled copy is available; check your connection before exporting.');}
 finally{historyLoading=false;}
}
function persistHistory(next){
 if(historyStorageError)throw Error('History storage needs attention. Existing drafts have been preserved.');
 if(localStorage.getItem(HISTORY_KEY)!==historyStoredRaw)throw Error('History was changed in another tab. Reload this page before saving.');
 H.mergeDrafts(historyBase,next);
 // Do not claim success or lose the previous draft if storage is full/disabled.
 const raw=JSON.stringify(next);localStorage.setItem(HISTORY_KEY,raw);historyStoredRaw=raw;historyDrafts=next;rebuildHistory();
}
function stageHistoryEvent(converted){
 if(historyError||historyConflicts.length)throw Error('Resolve history issues before adding results.');
 const next=JSON.parse(JSON.stringify(historyDrafts));
 next.players=converted.players.filter(p=>!historyBase.players.some(q=>q.id===p.id));
 const old=next.events.find(e=>e.event.id===converted.event.id),remote=historyBase.events.find(e=>e.id===converted.event.id)??null;
 const entry={event:converted.event,base:old&&H.canonical(remote)!==H.canonical(old.event)?old.base:H.canonical(remote)};
 next.events=next.events.filter(e=>e.event.id!==entry.event.id);next.events.push(entry);persistHistory(next);
}
function refreshLiveHistory(){
 historyLiveSummary=historySummary;
 try{if(!state.rounds.length)return;const existing=matchingHistoryEvent(state);const id=existing?.id??state.historyId??'current-preview';const converted=H.eventFromState(state,historyData,{id,date:state.historyDate??existing?.date??localDay()});
  historyLiveSummary=H.summarize({...historyData,players:converted.players,events:[...historyData.events.filter(e=>e.id!==id),converted.event]});
 }catch{/* Invalid event input is reported by the organizer's existing validation. */}
}
function matchProbability(m){
 if(m.score)return '';const lookup=new Map(historyData.players.flatMap(p=>[p.name,...(p.aliases??[])].map(n=>[H.normalize(n),p.id])));
 const teams=m.teams.map(t=>t.map(i=>lookup.get(H.normalize(state.players[i]))??H.playerId(state.players[i]))),prediction=H.predict(historyLiveSummary??historySummary,teams);
 return `<p class="match-probability small">${prediction.probability===null?'Win probability unavailable · both pairs need history':`Win probability · ${historyPercent(prediction.probability)} / ${historyPercent(1-prediction.probability)}`}<br><span class="muted">Workbook pair formula${m.score?'':' · saved results included'}</span></p>`;
}
function historyView(){
 const summary=H.summarize(historyData,{source:historySource,eventId:historyEvent});
 const scored=summary.games.length,events=new Set(summary.games.map(m=>m.eventId)).size,players=[...summary.players.values()].filter(p=>p.played).length;
 return `<section class="history-heading"><p class="eyebrow">THE LONG GAME</p><h2>Your domino record, together.</h2><p class="muted">Results, rivalries, and the next matchup. Ratings follow your Wednesday Group workbook.</p></section>
 <div class="stats"><div class="stat"><b>${scored}</b><span>Completed games</span></div><div class="stat"><b>${events}</b><span>Events with results</span></div><div class="stat"><b>${players}</b><span>Players</span></div><div class="stat"><b>${historyDrafts.events.length}</b><span>Local event drafts</span></div></div>
 <div class="history-tools"><label>Results<select id="historySource"><option value="">All groups</option><option value="workbook" ${historySource==='workbook'?'selected':''}>Wednesday Group</option><option value="app" ${historySource==='app'?'selected':''}>App tournaments</option></select></label><label>Event<select id="historyEvent"><option value="">All events</option>${historyData.events.filter(e=>!historySource||e.source?.kind===historySource).slice().reverse().map(e=>`<option value="${esc(e.id)}" ${historyEvent===e.id?'selected':''}>${esc(e.date+' · '+e.title)}</option>`).join('')}</select></label><span class="small muted">${esc(historyStatus)}${historyLoading?' · refreshing…':''}</span></div>
 ${historyError?`<div class="notice" role="alert">${esc(historyError)}</div>`:''}
 ${historyConflicts.length?`<div class="notice" role="alert"><b>Shared history changed while you had local drafts.</b><p>Export is paused. Review the affected records: ${historyConflicts.map(c=>esc(c.title)).join(', ')}.</p><button id="historyUsePublished">Discard local drafts and use shared history</button><button id="historyKeepDrafts">Keep my versions of conflicting events</button></div>`:''}
 <div class="history-tabs" role="group" aria-label="Statistics views">${[['players','Players'],['pairs','Partnerships'],['h2h','Head to head'],['predict','Win probability'],['events','Game history'],['manage','Update & export']].map(([id,label])=>`<button data-history-tab="${id}" class="${historyTab===id?'active':''}">${label}</button>`).join('')}</div>
 <div id="historyContent">${historyTab==='players'||historyTab==='pairs'?historyStatsTable(summary):historyTab==='h2h'?historyH2H(summary):historyTab==='predict'?historyPrediction(summary):historyTab==='events'?historyGames(summary):historyManage()}</div>
 <details class="panel history-method"><summary>How ratings and probabilities work</summary><p><b>ELO Score = 0.50 × average points + 0.25 × win rate + 0.05 × total points + 0.10 × average points in wins + 0.10 × average points in losses.</b> Win rate is a fraction from 0 to 1. This reproduces the workbook’s custom score, including its cumulative-points term; playing more games influences the rating.</p><p>Probability for A = 1 / (1 + 10<sup>((rating B − rating A) / 400)</sup>). Game predictions use partnership ratings, and remain unavailable until both pairs have results together. Individual H2H counts only games on opposite teams. Pair H2H requires those exact partnerships.</p><p>The workbook uses 1 for an individual’s missing loss average and 0 for a pair’s; missing win averages contribute 0. Players with no games have no rating. Expected win % averages predictions against eligible opponents in the selected results. WOE is actual win rate minus expected win rate. A championship game is won at its recorded target (120 for new finals), including when the loser exceeds 100.</p><p>These are model estimates, not calibrated guarantees. Small samples may be misleading. Filters recalculate ratings from the selected games. Upcoming organizer games use all history plus saved results in the current event; completed games show their result without a retrospective prediction.</p></details>`;
}
function historyStatsTable(summary){
 const pairs=historyTab==='pairs';let rows=[...(pairs?summary.pairs:summary.players).values()].filter(p=>p.played>=Math.max(1,historyMin)&&H.normalize(p.name).includes(H.normalize(historySearch)));
 rows.sort((a,b)=>(b[historySort]??-Infinity)-(a[historySort]??-Infinity)||a.name.localeCompare(b.name));
 return `<div class="history-tools"><label>Find ${pairs?'partnership':'player'}<input id="historySearch" type="search" value="${esc(historySearch)}" placeholder="Search names"></label><label>Minimum games<input id="historyMin" type="number" min="0" value="${historyMin}"></label><label>Sort by<select id="historySort">${[['rating','ELO Score'],['winRate','Win %'],['played','Games played'],['average','Average points']].map(([id,label])=>`<option value="${id}" ${historySort===id?'selected':''}>${label}</option>`).join('')}</select></label><button id="historyApply">Apply</button></div>
 <div class="table-wrap"><table><caption>${pairs?'Partnership':'Player'} statistics · selected results</caption><thead><tr>${['Rank',pairs?'Partnership':'Player','ELO Score','Played','W','L','Win %','Points','Avg pts','Avg win','Avg loss','Expected win %','WOE'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.name)}</td><td><b>${historyNumber(p.rating,2)}</b></td><td>${p.played}</td><td>${p.wins}</td><td>${p.losses}</td><td>${historyPercent(p.winRate)}</td><td>${p.points}</td><td>${historyNumber(p.average)}</td><td>${historyNumber(p.winAverage)}</td><td>${historyNumber(p.lossAverage)}</td><td>${historyPercent(p.expected)}</td><td>${p.woe===null?'—':historyNumber(p.woe*100)+' pp'}</td></tr>`).join('')||'<tr><td colspan="13">No results match these filters.</td></tr>'}</tbody></table></div>`;
}
function historyOptions(rows,value){return rows.map(p=>`<option value="${esc(p.id)}" ${p.id===value?'selected':''}>${esc(p.name)}</option>`).join('');}
function historyH2H(summary){
 const rows=[...(historyMode==='pairs'?summary.pairs:summary.players).values()].filter(p=>p.played).sort((a,b)=>a.name.localeCompare(b.name));
 if(!rows.some(p=>p.id===historyA))historyA=rows[0]?.id??'';if(!rows.some(p=>p.id===historyB)||historyA===historyB)historyB=rows.find(p=>p.id!==historyA)?.id??'';
 const result=H.h2h(summary,historyA,historyB,historyMode),a=rows.find(p=>p.id===historyA),b=rows.find(p=>p.id===historyB),model=H.probability(a?.rating,b?.rating);
 const invalid=historyA===historyB||(historyMode==='pairs'&&a?.members.some(id=>b?.members.includes(id)));
 return `<section class="panel"><div class="history-tools"><label>Compare<select id="historyMode"><option value="players" ${historyMode==='players'?'selected':''}>Players as opponents</option><option value="pairs" ${historyMode==='pairs'?'selected':''}>Exact partnerships</option></select></label><label>Side A<select id="historyA">${historyOptions(rows,historyA)}</select></label><label>Side B<select id="historyB">${historyOptions(rows,historyB)}</select></label></div>${invalid?'<p>Choose different opponents with no shared players.</p>':`<h2>${esc(a?.name??'Choose opponents')} <span class="muted">vs</span> ${esc(b?.name??'')}</h2><div class="stats"><div class="stat"><b>${result.played}</b><span>Meetings</span></div><div class="stat"><b>${result.wins} – ${result.losses}</b><span>Side A wins – losses</span></div><div class="stat"><b>${historyPercent(result.winRate)}</b><span>Side A H2H win rate</span></div><div class="stat"><b>${historyNumber(result.average)}</b><span>Side A average points</span></div></div><p>${result.played?'Counts games played against each other, excluding games as teammates.':'No recorded meetings in these results.'}</p><p class="small muted">Current formula estimate for side A: ${historyPercent(model)}. ${historyMode==='players'?'Individual comparison; actual game odds depend on both partnerships.':'Uses each pair’s full record in the selected results.'}</p>`}</section>`;
}
function historyPrediction(summary){
 const rows=historyData.players.slice().sort((a,b)=>a.name.localeCompare(b.name));if(!matchupIds.length)matchupIds=rows.slice(0,4).map(p=>p.id);
 const teams=[matchupIds.slice(0,2),matchupIds.slice(2,4)],result=H.predict(summary,teams);
 return `<section class="panel"><p class="eyebrow">NEXT MATCHUP</p><h2>Who has the edge?</h2><p class="muted">Choose two partnerships. Uses the results selected above.</p><div class="prediction-teams">${[0,1].map(side=>`<fieldset><legend>Team ${side?'B':'A'}</legend>${[0,1].map(i=>`<label>Player ${i+1}<select id="matchup${side*2+i}">${historyOptions(rows,matchupIds[side*2+i])}</select></label>`).join('')}</fieldset>`).join('')}</div><div class="prediction-result" aria-live="polite">${result.probability===null?`<h3>Probability unavailable</h3><p>${esc(result.reason)}</p>`:`<div class="probability-numbers"><strong>${historyPercent(result.probability)}</strong><span>Team A · Team B</span><strong>${historyPercent(1-result.probability)}</strong></div><div class="probability-bar" aria-hidden="true"><span style="width:${result.probability*100}%"></span></div><p>Partnership games: ${result.games.join(' / ')} · Partnership ratings: ${result.ratings.map(n=>historyNumber(n,2)).join(' / ')}</p>`}</div></section>`;
}
function historyGames(summary){
 const events=historyData.events.filter(e=>(!historySource||e.source?.kind===historySource)&&(!historyEvent||e.id===historyEvent)).slice().reverse();
 return events.map(e=>`<details class="panel"><summary><b>${esc(e.date)} · ${esc(e.title)}</b> — ${e.matches.filter(m=>m.score).length} / ${e.matches.length} games scored</summary><p class="small muted">${esc(e.source?.file??'Organizer app')} · Event ID: ${esc(e.id)}</p><div class="table-wrap"><table><thead><tr><th>Game</th><th>Team A</th><th>Score</th><th>Team B</th><th>Stage</th><th>Source</th></tr></thead><tbody>${e.matches.map(m=>`<tr><td>${m.order+1}</td><td>${esc(historyNames(m.teams[0]))}</td><td>${m.score?m.score.join(' – '):'Unplayed'}</td><td>${esc(historyNames(m.teams[1]))}</td><td>${esc(m.stage??'')}</td><td>${esc(m.sourceRange??m.id)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')||'<p>No events match these filters.</p>';
}
function historyManage(){
 const candidate=pendingHistoryState??state,existing=matchingHistoryEvent(candidate),date=candidate.historyDate??existing?.date??(candidate.updated?localDay(candidate.updated):localDay());
 const count=candidate.rounds.reduce((n,r)=>n+r.matches.filter(m=>m.score).length,0)+(candidate.playoffs?.quarters??[]).filter(m=>m?.score).length+(candidate.playoffs?.semis??[]).filter(m=>m?.score).length+(candidate.playoffs?.final?.score?1:0);
 return `<div class="layout"><section class="panel"><h2>${pendingHistoryState?'Review imported backup':'Add the current event'}</h2><p><b>${esc(candidate.title)}</b> · ${count} saved games</p><label>Event date<input id="historyDate" type="date" value="${esc(date)}"></label><label class="history-space">Save as<select id="historyTarget"><option value="">New event</option>${historyData.events.filter(e=>e.source?.kind==='app').map(e=>`<option value="${esc(e.id)}" ${e.id===existing?.id?'selected':''}>Update ${esc(e.date+' · '+e.title)}</option>`).join('')}</select></label><p class="small muted">Matching names use the same player identity across events. Use the same spelling each time. Updating an event replaces its games, including corrections and removed results.</p><div class="actions"><button id="historyStage" class="primary" ${!count||historyError||historyConflicts.length?'disabled':''}>Review & save to history</button>${pendingHistoryState?'<button id="historyCancelImport">Cancel import</button>':''}<button id="historyImportBackup">Import event backup</button><input id="historyBackupFile" type="file" accept=".json,application/json" hidden></div></section>
 <section class="panel"><h2>Update the shared record</h2><ol><li>Save the event to history on the left.</li><li>Export the complete history file below.</li><li>Replace <b>dominos-tournament-data.json</b> in GitHub and open a pull request.</li><li>After merging, GitHub Pages serves the new history automatically.</li></ol><p class="small muted">${historyDrafts.events.length} local event draft(s). Export downloads a file; it does not publish to GitHub. Event backups remain separate.</p><div class="actions"><button id="historyDownload" class="primary" ${historyError||historyConflicts.length?'disabled':''}>Export history JSON</button><button id="historyRefresh">Refresh shared history</button><button id="historyImportData">Import history JSON</button><input id="historyDataFile" type="file" accept=".json,application/json" hidden></div></section></div>`;
}
async function historyExport(){
 if(localStorage.getItem(HISTORY_KEY)!==historyStoredRaw){tell('History changed in another tab. Reload before exporting.');return;}
 await refreshHistory();
 if(historyError||historyConflicts.length){view='history';render();tell('Resolve history issues before exporting.');return;}
 if(location.protocol!=='file:'&&historyStatus.includes('failed')){tell('Export paused because shared history could not be refreshed. Try again when connected.');return;}
 const data=H.validate(historyData);download('dominos-tournament-data.json',JSON.stringify(data,null,2)+'\n','application/json');tell('History downloaded. Replace the file in GitHub and open a pull request.');render();
}
function bindHistory(){
 if(view!=='history')return;
 document.querySelectorAll('[data-history-tab]').forEach(b=>b.onclick=()=>{historyTab=b.dataset.historyTab;render();});
 $('historySource').onchange=e=>{historySource=e.target.value;historyEvent='';render();};$('historyEvent').onchange=e=>{historyEvent=e.target.value;render();};
 if($('historyApply'))$('historyApply').onclick=()=>{historySearch=$('historySearch').value;historyMin=Math.max(0,Number($('historyMin').value)||0);historySort=$('historySort').value;render();};
 if($('historyMode')){for(const id of ['historyMode','historyA','historyB'])$(id).onchange=()=>{historyMode=$('historyMode').value;historyA=$('historyA').value;historyB=$('historyB').value;render();};}
 for(let i=0;i<4;i++)if($('matchup'+i))$('matchup'+i).onchange=()=>{matchupIds=[0,1,2,3].map(j=>$('matchup'+j).value);render();};
 if($('historyRefresh'))$('historyRefresh').onclick=async()=>{await refreshHistory();render();};
 if($('historyDownload'))$('historyDownload').onclick=()=>historyExport().catch(e=>tell(e.message));
 if($('historyCancelImport'))$('historyCancelImport').onclick=()=>{pendingHistoryState=null;render();};
 if($('historyStage'))$('historyStage').onclick=async()=>{
  try{const candidate=pendingHistoryState??state,date=$('historyDate').value,target=$('historyTarget').value;const matched=matchingHistoryEvent(candidate);
   if(matched&&!target)throw Error('This event is already in history. Select its existing entry to avoid counting it twice.');
   const id=target||candidate.historyId||'event-'+crypto.randomUUID();const converted=H.eventFromState(candidate,historyData,{id,date});
   const oldCount=historyData.events.find(e=>e.id===id)?.matches.filter(m=>m.score).length??0,newCount=converted.event.matches.filter(m=>m.score).length;
   if(!await ask(target?'Replace this event’s history?':'Add this event to history?',`${candidate.title} on ${date}: ${newCount} scored games. ${target?`The existing ${oldCount} scored games will be replaced. ${newCount<oldCount?'This removes saved results from the shared history export. Check that you are not importing an older backup.':''}`:'A new event will be added.'}`,'Save history'))return;
   const remote=historyData.events.find(e=>e.id===id);if(remote?.source)converted.event.source=remote.source;
   if(!pendingHistoryState){const latest=localStorage.getItem(KEY);if(latest&&H.canonical(JSON.parse(latest))!==H.canonical(state))throw Error('The tournament changed in another tab. Reload before saving it to history.');}
   stageHistoryEvent(converted);if(!pendingHistoryState){state.historyId=id;state.historyDate=date;save();}pendingHistoryState=null;render();tell('History saved locally. Export the history JSON to update GitHub.');
  }catch(e){tell(e.message);}
 };
 if($('historyImportBackup')){$('historyImportBackup').onclick=()=>$('historyBackupFile').click();$('historyBackupFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('Backup is too large.');pendingHistoryState=D.validate(JSON.parse(await file.text()));render();tell('Review the event date and matching event before saving.');}catch(error){tell(error.message);}};}
 if($('historyImportData')){$('historyImportData').onclick=()=>$('historyDataFile').click();$('historyDataFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000000)throw Error('History file is too large.');const incoming=H.validate(JSON.parse(await file.text()));if(!await ask('Merge this history file?',`Review ${incoming.events.length} incoming events. Matching event IDs replace local versions; other existing events are kept.`,'Merge history'))return;
  let next=JSON.parse(JSON.stringify(historyDrafts));for(const p of incoming.players){const existing=historyData.players.find(q=>q.id===p.id);if(existing&&H.canonical(existing)!==H.canonical(p))throw Error('Player identity differs: '+p.name);if(!existing)next.players.push(p);}
  for(const event of incoming.events){const old=next.events.find(e=>e.event.id===event.id),remote=historyBase.events.find(e=>e.id===event.id)??null;next.events=next.events.filter(e=>e.event.id!==event.id);if(H.canonical(remote)!==H.canonical(event))next.events.push({event,base:old&&H.canonical(remote)!==H.canonical(old.event)?old.base:H.canonical(remote)});}
  persistHistory(next);render();tell('History merged locally. Export to update GitHub.');}catch(error){tell(error.message);}};}
 if($('historyUsePublished'))$('historyUsePublished').onclick=async()=>{if(await ask('Discard all local history drafts?','Only the shared history file will remain. Exported files and the current organizer event are unaffected.','Use shared history')){try{persistHistory({players:[],events:[]});render();}catch(e){tell(e.message);}}};
 if($('historyKeepDrafts'))$('historyKeepDrafts').onclick=async()=>{if(historyConflicts.some(c=>c.type==='player'))return tell('Player identity changed in shared history. Resolve the player records before exporting.');if(await ask('Keep local event versions?','Your local versions will replace conflicting shared events in the next export. Review both versions in GitHub before merging.','Keep local versions')){try{const next=JSON.parse(JSON.stringify(historyDrafts));next.events.forEach(e=>e.base=H.canonical(historyBase.events.find(r=>r.id===e.event.id)??null));persistHistory(next);render();}catch(e){tell(e.message);}}};
}
