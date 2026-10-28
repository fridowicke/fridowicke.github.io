# Shared sofa ratings

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
"hearts": 2 }` updates only that cell. Clients poll every 2.5 seconds while visible.
Failed writes roll back and show an error. The footer exports the current group
scores as JSON. Legacy browser scores are retained without modification.

## Hosting later

Nothing has been deployed. GitHub Pages currently serves frido.ai and cannot run
this API. The local server binds to loopback and is available only on this Mac.

To share ratings on frido.ai, host this backend on an always-on service with a
persistent disk and HTTPS. Reverse proxy **only** `/sofasberlin/api/ratings` to it,
keeping the existing static website on GitHub Pages. Pass
`--public-origin https://frido.ai` and a persistent `--database` path to the backend.
The proxy must forward the real origin. Do not expose the repository's development
file server publicly. Back up and migrate the local SQLite database before launch
so Frido's imported scores and any subsequent group ratings survive.

The frontend already uses this same-origin endpoint. Publishing static files alone
will show the saved snapshot with editing disabled until the API is available.
Choosing and provisioning hosting, routing the endpoint, and publishing remain
separate steps requiring the user's instruction.
