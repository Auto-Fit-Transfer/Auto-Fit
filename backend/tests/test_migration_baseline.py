"""Prevent replaying renamed history or mutating the captured production baseline."""

import hashlib
import json
from pathlib import Path


def test_migration_files_match_captured_production_history():
    root = Path(__file__).resolve().parents[2] / "supabase"
    baseline = json.loads((root / "migration-baseline-20261104.json").read_text())
    applied = set()
    for row in baseline["applied"]:
        name = f"{row['version']}_{row['name']}.sql"
        path = root / "migrations" / name
        assert path.exists(), name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"], name
        applied.add(name)
    actual = {path.name for path in (root / "migrations").glob("*.sql")}
    assert actual - applied == set(baseline["pending"])
    assert len(applied) == 80
