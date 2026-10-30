import psycopg


def test_server_is_postgres_16(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        row = conn.execute("SHOW server_version_num").fetchone()
    assert row is not None
    assert int(row[0]) // 10000 == 16
