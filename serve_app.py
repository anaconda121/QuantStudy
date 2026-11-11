"""Serve QuantStudy and append browser progress snapshots to SQLite."""

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from backup_progress import import_payload


ROOT = Path(__file__).parent
DATABASE = ROOT / "quantstudy-progress.sqlite3"


class AppHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/progress":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 10_000_000:
                raise ValueError("Progress payload is too large.")
            payload = json.loads(self.rfile.read(length))
            snapshot_id, completed = import_payload(payload, DATABASE, "browser-persist", deduplicate=True)
            response = {"snapshotId": snapshot_id, "completed": completed}
            body = json.dumps(response).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, TypeError, json.JSONDecodeError, KeyError) as error:
            self.send_error(400, str(error))
        except Exception as error:
            self.send_error(500, str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), AppHandler)
    print(f"QuantStudy running at http://localhost:{args.port}")
    print(f"SQLite backups: {DATABASE}")
    server.serve_forever()


if __name__ == "__main__":
    main()