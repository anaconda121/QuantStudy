"""Import a QuantStudy browser export into a durable local SQLite database."""

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


FIELDS = {
    "completed": "completed",
    "favorites": "favorite",
    "notes": "note",
    "ratings": "rating",
    "answers": "answer",
    "answerFeedback": "feedback",
    "attempts": "attempts",
    "correctAttempts": "correct_attempts",
    "incorrectAttempts": "incorrect_attempts",
}


def load_export(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        export = json.load(file)
    if not isinstance(export, dict):
        raise ValueError("The progress export must contain a JSON object.")
    return export


def question_ids(export: dict) -> set[str]:
    ids = set(export.get("completedIds", []))
    for field in FIELDS:
        values = export.get(field, {})
        if isinstance(values, dict):
            ids.update(values)
    return {str(question_id) for question_id in ids}


def value(export: dict, field: str, question_id: str, default):
    values = export.get(field, {})
    return values.get(question_id, default) if isinstance(values, dict) else default


def comparable_payload(export: dict) -> str:
    comparison = dict(export)
    comparison.pop("savedAt", None)
    return json.dumps(comparison, ensure_ascii=True, sort_keys=True)


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imported_at TEXT NOT NULL,
            source_file TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS question_progress (
            snapshot_id INTEGER NOT NULL,
            question_id TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            favorite INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            rating TEXT NOT NULL DEFAULT '',
            answer TEXT NOT NULL DEFAULT '',
            feedback TEXT NOT NULL DEFAULT '',
            attempts INTEGER NOT NULL DEFAULT 0,
            correct_attempts INTEGER NOT NULL DEFAULT 0,
            incorrect_attempts INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (snapshot_id, question_id),
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_question_progress_completed
            ON question_progress(snapshot_id, completed);
        """
    )


def import_payload(export: dict, database_path: Path, source_file: str, deduplicate: bool = False) -> tuple[int, int]:
    ids = sorted(question_ids(export))
    imported_at = datetime.now(timezone.utc).isoformat()
    payload_json = json.dumps(export, ensure_ascii=True, sort_keys=True)
    comparison_json = comparable_payload(export)

    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA foreign_keys=ON")
        create_schema(connection)
        if deduplicate:
            latest = connection.execute(
                "SELECT id FROM snapshots ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if latest:
                previous = connection.execute(
                    "SELECT payload_json FROM snapshots WHERE id = ?", (latest[0],)
                ).fetchone()
                if previous and comparable_payload(json.loads(previous[0])) == comparison_json:
                    completed = connection.execute(
                        "SELECT COUNT(*) FROM question_progress WHERE snapshot_id = ? AND completed = 1",
                        (latest[0],),
                    ).fetchone()[0]
                    return latest[0], completed
        with connection:
            cursor = connection.execute(
                "INSERT INTO snapshots(imported_at, source_file, payload_json) VALUES (?, ?, ?)",
                (imported_at, source_file, payload_json),
            )
            snapshot_id = cursor.lastrowid
            for question_id in ids:
                connection.execute(
                    """
                    INSERT INTO question_progress(
                        snapshot_id, question_id, completed, favorite, note, rating,
                        answer, feedback, attempts, correct_attempts, incorrect_attempts
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        snapshot_id,
                        question_id,
                        int(bool(value(export, "completed", question_id, False))),
                        int(bool(value(export, "favorites", question_id, False))),
                        str(value(export, "notes", question_id, "") or ""),
                        str(value(export, "ratings", question_id, "") or ""),
                        str(value(export, "answers", question_id, "") or ""),
                        str(value(export, "answerFeedback", question_id, "") or ""),
                        int(value(export, "attempts", question_id, 0) or 0),
                        int(value(export, "correctAttempts", question_id, 0) or 0),
                        int(value(export, "incorrectAttempts", question_id, 0) or 0),
                    ),
                )
        completed = connection.execute(
            "SELECT COUNT(*) FROM question_progress WHERE snapshot_id = ? AND completed = 1",
            (snapshot_id,),
        ).fetchone()[0]
        return snapshot_id, completed
    finally:
        connection.close()


def import_export(export_path: Path, database_path: Path) -> tuple[int, int]:
    return import_payload(load_export(export_path), database_path, str(export_path))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=Path("quantstudy-progress.json"))
    parser.add_argument("--db", type=Path, default=Path("quantstudy-progress.sqlite3"))
    args = parser.parse_args()
    snapshot_id, completed = import_export(args.input, args.db)
    print(f"Imported snapshot {snapshot_id} into {args.db}")
    print(f"Completed questions in snapshot: {completed}")


if __name__ == "__main__":
    main()