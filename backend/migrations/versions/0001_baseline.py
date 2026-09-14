"""Snapshot of the pre-planner schema. Existing tables and IDs are retained."""

import json
from pathlib import Path
from alembic import op
from sqlalchemy import inspect

revision = "0001"
down_revision = None


def upgrade():
    existing = set(inspect(op.get_bind()).get_table_names())
    for name, create, indexes in json.loads(
        (Path(__file__).parents[1] / "baseline.json").read_text()
    ):
        if name not in existing:
            op.execute(create)
            for statement in indexes:
                op.execute(statement)


def downgrade():
    raise RuntimeError("Restore a backup to roll back the baseline without data loss")
