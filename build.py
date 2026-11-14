from pathlib import Path
import json
p=Path(__file__).parent
template=(p/'template.html').read_text(encoding='utf-8')
template=template.replace('/* THEME_STYLES */',(p/'hawaii.css').read_text(encoding='utf-8'))
template=template.replace('/* HISTORY_STYLES */',(p/'history.css').read_text(encoding='utf-8'))
template=template.replace('<!-- ISLAND_ART -->',(p/'island-header.svg').read_text(encoding='utf-8'))
template=template.replace('/* CORE_SCRIPT */',(p/'core.js').read_text(encoding='utf-8'))
template=template.replace('/* HISTORY_CORE */',(p/'history-core.js').read_text(encoding='utf-8'))
template=template.replace('/* HISTORY_UI */',(p/'history-ui.js').read_text(encoding='utf-8'))
data=json.loads((p/'dominos-tournament-data.json').read_text(encoding='utf-8'))
template=template.replace('/* HISTORY_DATA */',json.dumps(data,ensure_ascii=True).replace('<','\\u003c'))
template=template.replace('/* APP_SCRIPT */',(p/'app.js').read_text(encoding='utf-8'))
(p/'Domino-Night.html').write_text(template,encoding='utf-8')
(p/'statistics.html').write_text(template.replace('<title>Hawaiian domino · Tournament desk</title>','<title>Hawaiian domino · Statistics</title>'),encoding='utf-8')
print(p/'Domino-Night.html')
