import os
import subprocess
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["docker", "compose", "-f", str(ROOT / "docker-compose.test.yml")]
DEFAULT_URL = "postgresql://dca:dca-test-only@127.0.0.1:55432/postgres"


@pytest.fixture(scope="session")
def pg_url() -> Iterator[str]:
    """URL of a fresh database per session.

    The compose container uses tmpfs and is torn down afterwards; with an external
    DCA_TEST_DATABASE_URL the per-session database is left for the operator to clean.
    """
    admin_url = os.environ.get("DCA_TEST_DATABASE_URL")
    started = False
    if not admin_url:
        subprocess.run([*COMPOSE, "up", "-d", "--wait"], check=True, cwd=ROOT)  # noqa: S603 - fixed argv, no shell
        admin_url = DEFAULT_URL
        started = True
    name = f"dca_test_{uuid.uuid4().hex[:12]}"
    try:
        with psycopg.connect(admin_url, autocommit=True) as conn:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        yield make_conninfo(admin_url, dbname=name)
    finally:
        if started:
            subprocess.run([*COMPOSE, "down", "-v"], check=False, cwd=ROOT)  # noqa: S603 - fixed argv, no shell
