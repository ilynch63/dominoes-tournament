"""Read raw games (never execute workbook macros) and emit reviewable history JSON.

Usage: python tools/import_history.py workbook.xlsm backup.json --date 2026-10-03
Requires openpyxl for read-only workbook extraction. Run from the repository root.
"""
import argparse
import datetime
import json
import subprocess
import unicodedata
import re
from pathlib import Path
import openpyxl


def player_id(name):
    normalized = ''.join(c for c in unicodedata.normalize('NFKD', name) if not unicodedata.combining(c))
    return 'player-' + re.sub('[^a-z0-9]+', '-', normalized.strip().lower())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook', type=Path)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--date', required=True)
    parser.add_argument('--node', default='node')
    parser.add_argument('--output', type=Path, default=Path('dominos-tournament-data.json'))
    args = parser.parse_args()
    datetime.date.fromisoformat(args.date)
    wb = openpyxl.load_workbook(args.workbook, data_only=True, read_only=True)
    players, events = {}, {}
    for rownum, row in enumerate(wb['Juegos'].iter_rows(min_row=5, min_col=2, max_col=8, values_only=True), 5):
        if all(v is None for v in row):
            continue
        date, a, b, score_a, c, d, score_b = row
        if not isinstance(date, datetime.datetime) or any(not isinstance(n, str) or not n.strip() for n in [a,b,c,d]):
            raise ValueError(f'Incomplete game at Juegos!B{rownum}:H{rownum}')
        if any(type(s) not in (int, float) or s != int(s) or s < 0 for s in [score_a, score_b]):
            raise ValueError(f'Invalid score at row {rownum}')
        ids = []
        for name in [a,b,c,d]:
            name = name.strip()
            pid = player_id(name)
            if pid in players and players[pid]['name'] != name:
                raise ValueError(f'Review player alias: {name}')
            players[pid] = {'id':pid,'name':name,'aliases':[]}
            ids.append(pid)
        day = date.date().isoformat()
        event = events.setdefault(day, {'id':'wednesday-'+day,'title':'Wednesday Group','date':day,
            'source':{'kind':'workbook','file':args.workbook.name,'sheet':'Juegos'},'matches':[]})
        event['matches'].append({'id':f'row-{rownum}','order':len(event['matches']),'stage':'Group play','target':100,
            'teams':[ids[:2],ids[2:]],'score':[int(score_a),int(score_b)],'sourceRange':f'B{rownum}:H{rownum}'})
    data = {'schemaVersion':1,'ratingModel':'wednesday-workbook-v1','players':list(players.values()),'events':list(events.values())}
    # Use the exact same converter and validator as the app for the event backup.
    script = """const fs=require('fs'),H=require('./history-core.js'),D=require('./core.js');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));const state=D.validate(payload.state);
const converted=H.eventFromState(state,payload.data,{id:'aloha-'+payload.date,date:payload.date});
converted.event.source={kind:'app',file:payload.file};
const data={...payload.data,players:converted.players,events:[...payload.data.events,converted.event],defaultPlayers:state.players.map(n=>converted.players.find(p=>H.normalize(p.name)===H.normalize(n)).id)};
data.players.sort((a,b)=>a.id.localeCompare(b.id));data.events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
process.stdout.write(JSON.stringify(H.validate(data),null,2)+'\\n');"""
    payload = {'state':json.loads(args.backup.read_text(encoding='utf-8-sig')),'data':data,'date':args.date,'file':args.backup.name}
    result = subprocess.run([args.node,'-e',script],input=json.dumps(payload),text=True,encoding='utf-8',capture_output=True,check=True)
    args.output.write_text(result.stdout,encoding='utf-8')
    final = json.loads(result.stdout)
    print(f"{len(final['players'])} players; {len(final['events'])} events; "
          f"{sum(bool(m['score']) for e in final['events'] for m in e['matches'])} scored games")


if __name__ == '__main__':
    main()
