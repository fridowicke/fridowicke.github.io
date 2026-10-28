# Shared sofa ratings

## Live managed storage

The frontend now uses the hosted Sites API configured in
`sofasberlin/api-config.json`:
`https://sofa-ratings-frido.fridoalonso.chatgpt.site/api/ratings`.
Both frido.ai and localhost share that same managed D1 database. No user server
needs to remain running. Initial migration imported the existing 48 stored cells,
including all 46 Frido scores, after taking a backup in this task's output folder.

Backend source: `/Users/friedrichwicke/Developer/private/sofa-ratings-api`.
Site identity and schema migrations are tracked there. Publish API changes through
Sites; publish the static frontend through the existing GitHub Pages repository.
The Sites database survives API redeployment. The endpoint deliberately has no
sign-in: the three names are an honour system, as requested.

The frontend refreshes other people's scores every five seconds while visible.
Its footer exports a JSON backup of all three people's current scores. Back up
through the API or the managed database before making future data migrations.

## Optional offline local server

Set the config endpoint to `null` to use the Python/SQLite alternative below.
That local database is independent of cloud ratings. The original SQLite file
is retained as an additional migration backup.

Local preview (Python standard library; no install):

```sh
python3 tools/serve_sofas.py
```

Open http://localhost:8743/sofasberlin/. Pick Clara, Mamer or Frido. Each person can
set 0–3 hearts; Total sums the three ratings and starts sorted highest first.
The name picker is an honour system for the group, not authenticated accounts.

The SQLite database is stored outside the public site at
`~/Library/Application Support/Sofa Shortlist/ratings.sqlite3`. Keep this file and
its live WAL with the running process; use SQLite's backup API for live backups.
On first startup, Frido's scores are imported from `sofasberlin/ratings.json`.
Use `--seed /absolute/path/to/snapshot.json` for a newer `{ "scores": {...} }`
snapshot. Existing databases are never reseeded on restart.

`GET /sofasberlin/api/ratings` returns all three people's ratings and a revision.
`POST` to the same URL with JSON `{ "person": "clara", "sofaId": "ds85",
"hearts": 2 }` updates only that cell. Clients poll every five seconds while visible.
Failed writes roll back and show an error. The footer exports the current group
scores as JSON. Legacy browser scores are retained without modification.
