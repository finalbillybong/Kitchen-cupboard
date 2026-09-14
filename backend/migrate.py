"""Upgrade both legacy unversioned databases and clean installations."""

from pathlib import Path
from alembic.config import Config
from alembic import command
from database import engine


def upgrade(bind=engine):
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with bind.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


if __name__ == "__main__":
    upgrade()
