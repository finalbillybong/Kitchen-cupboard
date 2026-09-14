"""Recipe metadata, shared plans, grocery contributions and durable integrations."""

import json
from pathlib import Path
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"


def upgrade():
    for name in ("steps", "tags"):
        op.add_column(
            "meals", sa.Column(name, sa.JSON(), nullable=False, server_default="[]")
        )
    op.add_column(
        "meals",
        sa.Column("recipe_category", sa.String(100), nullable=False, server_default=""),
    )
    for name in ("prep_minutes", "cook_minutes"):
        op.add_column(
            "meals", sa.Column(name, sa.Integer(), nullable=False, server_default="0")
        )
    for name in ("allow_weekly_repeat", "to_try"):
        op.add_column(
            "meals", sa.Column(name, sa.Boolean(), nullable=False, server_default="0")
        )
    op.add_column(
        "list_items",
        sa.Column("already_have", sa.Boolean(), nullable=False, server_default="0"),
    )
    with op.batch_alter_table("meal_ingredients") as batch:
        batch.alter_column("quantity", existing_type=sa.Float(), nullable=True)
    for name, create, indexes in json.loads(
        (Path(__file__).parents[1] / "planner_tables.json").read_text()
    ):
        op.execute(create)
        for statement in indexes:
            op.execute(statement)


def downgrade():
    raise RuntimeError("Restore the database and uploads backup to roll back safely")
