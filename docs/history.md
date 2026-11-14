# Statistics and shared history

Open **Statistics & history** from the tournament desk, or open `statistics.html` on the same site. The history loads automatically from `dominos-tournament-data.json`. Everything runs in the browser; GitHub Pages hosts the file and there is no database or paid server.

## Included records

The initial import contains 27 players, 16 events, and 124 scored games:

- 102 games in `Domino -- Wednesday Group.xlsm`, `Juegos!B5:H106`, across 15 dates from June 10 to November 11, 2026.
- 22 scored qualifying games from the October 3, 2026 **SOY AMERICANO XII - ALOHA!** backup. Its 23rd game is unplayed and is retained without contributing statistics. The supplied backup has no playoff results.
- Irving, Tuto, and Waldemar are shared identities across the two sources, as confirmed by the organizer.
- Juan C's six games are included even though the workbook's summary tables omit him. Consequently, expected-win averages include additional eligible opponents and need not match the workbook's restricted summary roster.

Raw scores and source row locations are retained. Excel formulas, summary tables, and macros are not imported as games. Zero-point losses are valid results; blank scores are not zeros.

## After each tournament

1. Save scores in the tournament desk as usual. Keep using **Export backup** for event recovery.
2. Open **Statistics & history → Update & export**, or click **Export history** in the header.
3. Check the event date and **Save as** selection, then select **Review & save to history**. The preview tells you whether you are adding or replacing an event. An unfinished event can be saved; only scored games affect statistics.
4. Select **Export history JSON**. This downloads the complete `dominos-tournament-data.json`, including previous events and local drafts.
5. In GitHub, replace the root-level file on a new branch and open a pull request. Review the changed event records and the automated validation checks, then merge.
6. Reload the app or select **Refresh shared history**. The hosted app fetches the updated JSON without requiring a rebuild for data-only changes.

Exports do not create a PR or publish automatically. Keep one organizer tab. The statistics page refuses to overwrite newer changes from another tab; reload it when prompted. If the shared JSON changed while you had local edits to the same event, export pauses until you choose which version to retain. Review the final PR diff as well: GitHub may change after your download.

To add an older event without replacing the current tournament, use **Import event backup** on the statistics page, check the actual event date, and save it to history. To bring exported history from another browser, use **Import history JSON**. It merges by stable event ID, keeping unrelated events; incoming matching IDs replace their local versions after confirmation.

For corrections, select the existing event under **Save as**. Updating replaces the entire event's match list, so removed or corrected results cannot linger. Repeat exports and imports do not add another copy. Older backups are recognized by their event name, roster, and qualifying pairings. If those have changed, explicitly select the original event. Do not edit player IDs or event IDs to correct display text.

## Ratings, H2H, and predictions

The app intentionally uses the workbook's custom **ELO Score**, as requested:

`0.50 × average points + 0.25 × win fraction + 0.05 × total points + 0.10 × average points in wins + 0.10 × average points in losses`

The workbook supplies 1 for an individual player's missing loss average and 0 for a partnership's; missing win averages contribute 0. These exact fallbacks are preserved. Unplayed players have no rating. Wins use the game's actual target/result, including 120-point finals where the loser can score more than 100.

`P(A wins) = 1 / (1 + 10^((rating B − rating A) / 400))`

Each partnership has its own rating. **No probability is shown until both partnerships have at least one completed game together.** There is no fallback to individual ratings. Individual comparisons on the H2H page use individual ratings and are labeled separately from actual game odds. H2H counts opponents, not teammates; pair H2H matches the exact two partnerships in either player order.

This is the workbook's weighted score, not a sequential 1500/K-factor Elo system. Its total-points term rewards accumulated play. Model estimates have not been calibrated against future results. The UI exposes sample sizes and supports group, event, minimum-game, and name filters. Expected win percentage averages formula predictions against eligible opponents within those results; WOE is actual minus expected win rate in percentage points.

Upcoming tournament cards use all shared history plus scored games from the current event, replacing an archived copy of that event to avoid double-counting. Completed cards do not show a prediction calculated from their own outcome. The standalone statistics views include saved history drafts; add/update the current event there to include its latest results in the tables.

## File format and offline use

`schemaVersion: 1` and `ratingModel: "wednesday-workbook-v1"` identify the format. `players` contains stable IDs, display names, and optional unique aliases. `events` contains stable IDs, ISO event dates, provenance, and ordered matches. Each match records four player IDs, two scores or `null`, its target, and stage. Ratings are derived, never stored as authoritative totals.

The app merges names case-insensitively, ignoring accents and extra whitespace. Different spellings need an explicit alias in the player's `aliases` array, reviewed in GitHub; two different people must have distinct display names. Ambiguous aliases are rejected.

Local drafts live separately from the published file in browser storage. They are not a backup: export before clearing browser data or changing computers. The ordinary event backup and the complete history export serve different purposes.

`python build.py` embeds a copy of the JSON in both standalone HTML pages. Opening files directly or working offline uses that bundled snapshot, plus local drafts. HTTP pages fetch the latest JSON on startup; a failed refresh is labeled and blocks online export until it succeeds. After a data-only PR, rebuild before distributing new offline HTML copies. An existing browser tournament is never overwritten by the history file; a new browser starts with the supplied tournament roster and no new schedule.

## Development and source reconciliation

Run `node history-checks.cjs`, `node history-ui-checks.cjs`, and `node checks.cjs`, then `python build.py` after source changes. GitHub validates the shared JSON and runs these checks for PRs.

The read-only, one-time importer is `tools/import_history.py` (requires `openpyxl` and Node):

```text
python tools/import_history.py "path/to/Domino -- Wednesday Group.xlsm" "path/to/backup.json" --date 2026-10-03 --output dominos-tournament-data.json
```

It rebuilds the initial dataset from its two inputs; use the app's merge/export workflow to preserve later events. It never executes macros or changes the workbook. Tests reconcile all six listed individual ratings, fifteen partnership ratings, 88 populated H2H cells, and 120 probability cells against a frozen workbook reference. The reference and baseline files are test fixtures; future JSON-only updates do not require editing them.
