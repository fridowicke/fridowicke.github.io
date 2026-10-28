import importlib.util
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("serve_sofas", ROOT / "tools/serve_sofas.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RatingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "ratings.sqlite3"
        self.seed = {"scores": {"ds85": 3, "ds76": 2}}
        self.store = module.RatingsStore(self.database, ["ds85", "ds76"], self.seed)

    def tearDown(self):
        self.directory.cleanup()

    def test_seed_only_frido_and_never_reseed_existing_database(self):
        self.assertEqual(self.store.snapshot()["people"], {"clara": {}, "mamer": {}, "frido": self.seed["scores"]})
        self.store.update("frido", "ds85", 0)
        self.store.update("clara", "ds85", 2)
        reopened = module.RatingsStore(self.database, ["ds85", "ds76"], self.seed)
        self.assertEqual(reopened.snapshot()["people"]["frido"]["ds85"], 0)
        self.assertEqual(reopened.snapshot()["people"]["clara"]["ds85"], 2)

    def test_independent_concurrent_cells_and_revisions(self):
        changes = [(person, sofa, n % 4) for n, (person, sofa) in enumerate((p, s) for p in module.PEOPLE for s in ["ds85", "ds76"])]
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(lambda change: self.store.update(*change), changes))
        snapshot = self.store.snapshot()
        self.assertEqual(snapshot["revision"], 7)
        for person, sofa, hearts in changes:
            self.assertEqual(snapshot["people"][person][sofa], hearts)

    def test_invalid_values_never_change_storage(self):
        before = self.store.snapshot()
        for change in [("outsider", "ds85", 1), ("clara", "unknown", 2), *[("clara", "ds85", score) for score in [-1, 4, 1.5, "3", True, None]]]:
            with self.assertRaises(ValueError):
                self.store.update(*change)
        self.assertEqual(self.store.snapshot(), before)

    def test_http_clients_share_only_the_changed_cell(self):
        server = module.make_server(ROOT, self.database, port=0)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f"http://127.0.0.1:{server.server_port}"
        url = base + module.API_PATH

        def request(payload=None, origin=None, content_type="application/json"):
            headers = {"Content-Type": content_type}
            if origin:
                headers["Origin"] = origin
            data = None if payload is None else json.dumps(payload).encode()
            return urlopen(Request(url, data=data, headers=headers), timeout=5)

        try:
            with request({"person": "clara", "sofaId": "ds85", "hearts": 2}, base) as response:
                self.assertEqual(json.load(response)["people"]["clara"]["ds85"], 2)
            with request({"person": "mamer", "sofaId": "ds85", "hearts": 1}, base):
                pass
            with request() as response:
                people = json.load(response)["people"]
                self.assertEqual([people[p]["ds85"] for p in module.PEOPLE], [2, 1, 3])
            for payload, origin, content_type, expected in [
                ({"person": "clara", "sofaId": "ds85", "hearts": 4}, base, "application/json", 400),
                ({"person": "clara", "sofaId": "ds85", "hearts": 1}, "https://unrelated.example", "application/json", 403),
                ({"person": "clara", "sofaId": "ds85", "hearts": 1}, base, "text/plain", 415),
                ([], base, "application/json", 400),
            ]:
                with self.assertRaises(HTTPError) as caught:
                    request(payload, origin, content_type)
                self.assertEqual(caught.exception.code, expected)
                caught.exception.close()
            with urlopen(base + "/sofasberlin/", timeout=5) as response:
                self.assertEqual(response.status, 200)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == "__main__":
    unittest.main()
