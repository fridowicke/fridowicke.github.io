"""Serve the site and shared sofa ratings. Python standard library only."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit

PEOPLE = ("clara", "mamer", "frido")
API_PATH = "/sofasberlin/api/ratings"


class RatingsStore:
    def __init__(self, path, sofa_ids, seed):
        self.path = Path(path)
        self.sofa_ids = set(sofa_ids)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS ratings (person TEXT NOT NULL, sofa_id TEXT NOT NULL, hearts INTEGER NOT NULL CHECK(hearts BETWEEN 0 AND 3), updated_at TEXT NOT NULL, PRIMARY KEY(person, sofa_id))")
            connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)")
            if not connection.execute("SELECT 1 FROM metadata WHERE key='revision'").fetchone():
                now = datetime.now(timezone.utc).isoformat()
                connection.executemany("INSERT INTO ratings VALUES (?, ?, ?, ?)", [("frido", sofa_id, hearts, now) for sofa_id, hearts in seed.get("scores", {}).items() if sofa_id in self.sofa_ids and type(hearts) is int and 0 <= hearts <= 3])
                connection.execute("INSERT INTO metadata VALUES ('revision', 1)")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def snapshot(self):
        people = {person: {} for person in PEOPLE}
        with self.connect() as connection:
            connection.execute("BEGIN")
            revision = connection.execute("SELECT value FROM metadata WHERE key='revision'").fetchone()[0]
            for person, sofa_id, hearts in connection.execute("SELECT person, sofa_id, hearts FROM ratings"):
                people[person][sofa_id] = hearts
        return {"version": 1, "revision": revision, "people": people}

    def update(self, person, sofa_id, hearts):
        if person not in PEOPLE or sofa_id not in self.sofa_ids or type(hearts) is not int or not 0 <= hearts <= 3:
            raise ValueError("Choose a known person and sofa, with 0–3 hearts")
        with self.connect() as connection:
            connection.execute("INSERT INTO ratings VALUES (?, ?, ?, ?) ON CONFLICT(person, sofa_id) DO UPDATE SET hearts=excluded.hearts, updated_at=excluded.updated_at", (person, sofa_id, hearts, datetime.now(timezone.utc).isoformat()))
            connection.execute("UPDATE metadata SET value=value+1 WHERE key='revision'")
        return self.snapshot()


class SofaHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == API_PATH:
            self.send_json(self.server.ratings.snapshot())
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != API_PATH:
            self.send_json({"error": "Not found"}, 404)
            return
        # Names are a small trusted group's identity picker, not authentication.
        origin = self.headers.get("Origin")
        allowed_origin = self.server.public_origin or f"http://{self.headers.get('Host')}"
        if origin and origin != allowed_origin:
            self.send_json({"error": "Origin not allowed"}, 403)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json({"error": "Use application/json"}, 415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 2048:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Expected an object")
            result = self.server.ratings.update(payload.get("person"), payload.get("sofaId"), payload.get("hearts"))
        except (ValueError, TypeError):
            self.send_json({"error": "Choose a known person and sofa, with 0–3 hearts"}, 400)
            return
        self.send_json(result)


def make_server(root, database, seed_path=None, host="127.0.0.1", port=8743, public_origin=None):
    root = Path(root).resolve()
    ids = [sofa["id"] for filename in ("data.json", "extra.json") for sofa in json.loads((root / "sofasberlin" / filename).read_text())]
    seed = json.loads(Path(seed_path or root / "sofasberlin" / "ratings.json").read_text())
    store = RatingsStore(database, ids, seed)
    server = ThreadingHTTPServer((host, port), partial(SofaHandler, directory=str(root)))
    server.ratings = store
    server.public_origin = public_origin
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--database", type=Path, default=Path.home() / "Library/Application Support/Sofa Shortlist/ratings.sqlite3")
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8743)
    parser.add_argument("--public-origin", help="Expected browser origin when behind an HTTPS reverse proxy")
    args = parser.parse_args()
    if args.database.resolve().is_relative_to(args.root.resolve()):
        parser.error("The ratings database must be outside the served site directory")
    server = make_server(args.root, args.database, args.seed, args.host, args.port, args.public_origin)
    print(f"Sofa shortlist: http://{args.host}:{server.server_port}/sofasberlin/", flush=True)
    print(f"Ratings database: {args.database}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
