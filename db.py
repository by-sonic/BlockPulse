import logging
import os
import time
from pathlib import Path

import aiosqlite

import config

log = logging.getLogger(__name__)

_conn: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _conn
    if _conn is not None:
        try:
            await _conn.execute("SELECT 1")
            return _conn
        except Exception:
            log.warning("SQLite connection lost, reconnecting...")
            try:
                await _conn.close()
            except Exception:
                pass
            _conn = None

    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    _conn = await aiosqlite.connect(config.DB_PATH)
    _conn.row_factory = aiosqlite.Row
    await _conn.execute("PRAGMA journal_mode=WAL")
    await _conn.execute("PRAGMA synchronous=NORMAL")
    await _conn.execute("PRAGMA busy_timeout=3000")
    return _conn


async def init_db():
    db = await get_db()
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS probes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_ip TEXT NOT NULL,
            region TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            isp TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL,
            protocol TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 0,
            success INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            error TEXT NOT NULL DEFAULT '',
            source_type TEXT NOT NULL DEFAULT 'user',
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes(created_at);
        CREATE INDEX IF NOT EXISTS idx_probes_region ON probes(region, created_at);

        CREATE TABLE IF NOT EXISTS probe_hourly (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hour_ts REAL NOT NULL,
            region TEXT NOT NULL,
            protocol TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            ok INTEGER NOT NULL DEFAULT 0,
            avg_ms REAL NOT NULL DEFAULT 0,
            sources INTEGER NOT NULL DEFAULT 0,
            isps TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_key
            ON probe_hourly(hour_ts, region, protocol);
        CREATE INDEX IF NOT EXISTS idx_hourly_ts ON probe_hourly(hour_ts);

        CREATE TABLE IF NOT EXISTS subscribers (
            tg_id INTEGER PRIMARY KEY,
            region TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            secret_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            probe_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS provider_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_id TEXT NOT NULL,
            label TEXT NOT NULL,
            ip TEXT NOT NULL,
            protocols TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            FOREIGN KEY (provider_id) REFERENCES providers(id)
        );
    """)

    async with db.execute("PRAGMA table_info(probes)") as cur:
        columns = {row[1] for row in await cur.fetchall()}
    if "source_type" not in columns:
        await db.execute("ALTER TABLE probes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'user'")

    await db.commit()


async def insert_probe_batch(rows: list[dict]):
    db = await get_db()
    now = time.time()
    await db.executemany(
        "INSERT INTO probes "
        "(source_ip, region, city, isp, target_id, protocol, port, success, latency_ms, error, source_type, created_at) "
        "VALUES (:source_ip, :region, :city, :isp, :target_id, :protocol, :port, :success, :latency_ms, :error, :source_type, :ts)",
        [{**r, "ts": now, "source_type": r.get("source_type", "user")} for r in rows],
    )
    await db.commit()


async def get_pulse(hours: int = 1) -> list[dict]:
    db = await get_db()
    since = time.time() - hours * 3600
    async with db.execute(
        "SELECT region, protocol, SUM(total) as total, SUM(ok) as ok, "
        "  ROUND(SUM(avg_ms * ok) / MAX(SUM(ok), 1)) as avg_ms, "
        "  SUM(sources) as sources "
        "FROM ("
        "  SELECT region, protocol, COUNT(*) as total, SUM(success) as ok, "
        "    AVG(CASE WHEN success THEN latency_ms END) as avg_ms, "
        "    COUNT(DISTINCT source_ip) as sources "
        "  FROM probes WHERE created_at >= ? "
        "  GROUP BY region, protocol "
        "  UNION ALL "
        "  SELECT region, protocol, total, ok, avg_ms, sources "
        "  FROM probe_hourly WHERE hour_ts >= ? "
        ") GROUP BY region, protocol ORDER BY region, protocol",
        (since, since),
    ) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def get_pulse_timeline(hours: int = 24, interval: int = 1) -> list[dict]:
    db = await get_db()
    since = time.time() - hours * 3600
    bucket_secs = interval * 3600
    async with db.execute(
        "SELECT bucket, protocol, SUM(total) as total, SUM(ok) as ok FROM ("
        "  SELECT CAST((created_at - ?) / ? AS INTEGER) as bucket, "
        "    protocol, COUNT(*) as total, SUM(success) as ok "
        "  FROM probes WHERE created_at >= ? "
        "  GROUP BY bucket, protocol "
        "  UNION ALL "
        "  SELECT CAST((hour_ts - ?) / ? AS INTEGER) as bucket, "
        "    protocol, total, ok "
        "  FROM probe_hourly WHERE hour_ts >= ? "
        ") GROUP BY bucket, protocol ORDER BY bucket, protocol",
        (since, bucket_secs, since, since, bucket_secs, since),
    ) as cur:
        rows = []
        for r in await cur.fetchall():
            d = dict(r)
            bucket_ts = since + d["bucket"] * bucket_secs
            from datetime import datetime, timezone
            d["hour"] = datetime.fromtimestamp(bucket_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:00Z")
            d["rate"] = round(d["ok"] / d["total"], 3) if d["total"] else 0
            del d["bucket"]
            rows.append(d)
        return rows


async def get_pulse_region(region: str, hours: int = 6) -> list[dict]:
    db = await get_db()
    since = time.time() - hours * 3600
    async with db.execute(
        "SELECT protocol, SUM(total) as total, SUM(ok) as ok, "
        "  ROUND(SUM(avg_ms * ok) / MAX(SUM(ok), 1)) as avg_ms, "
        "  SUM(sources) as sources, isps "
        "FROM ("
        "  SELECT protocol, COUNT(*) as total, SUM(success) as ok, "
        "    AVG(CASE WHEN success THEN latency_ms END) as avg_ms, "
        "    COUNT(DISTINCT source_ip) as sources, "
        "    GROUP_CONCAT(DISTINCT isp) as isps "
        "  FROM probes WHERE created_at >= ? AND region = ? "
        "  GROUP BY protocol "
        "  UNION ALL "
        "  SELECT protocol, total, ok, avg_ms, sources, isps "
        "  FROM probe_hourly WHERE hour_ts >= ? AND region = ? "
        ") GROUP BY protocol ORDER BY protocol",
        (since, region, since, region),
    ) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def get_regions(hours: int = 24) -> list[str]:
    db = await get_db()
    since = time.time() - hours * 3600
    async with db.execute(
        "SELECT DISTINCT region FROM ("
        "  SELECT region FROM probes WHERE created_at >= ? AND region != '' "
        "  UNION "
        "  SELECT region FROM probe_hourly WHERE hour_ts >= ? AND region != '' "
        ") ORDER BY region",
        (since, since),
    ) as cur:
        return [r[0] for r in await cur.fetchall()]


async def get_stats() -> dict:
    db = await get_db()
    now = time.time()
    day_ago = now - 86400
    raw_total = (await (await db.execute("SELECT COUNT(*) FROM probes")).fetchone())[0]
    hourly_total = (await (await db.execute("SELECT COALESCE(SUM(total), 0) FROM probe_hourly")).fetchone())[0]
    raw_today = (await (await db.execute("SELECT COUNT(*) FROM probes WHERE created_at >= ?", (day_ago,))).fetchone())[0]
    hourly_today = (await (await db.execute("SELECT COALESCE(SUM(total), 0) FROM probe_hourly WHERE hour_ts >= ?", (day_ago,))).fetchone())[0]
    regions_raw = (await (await db.execute("SELECT COUNT(DISTINCT region) FROM probes WHERE created_at >= ?", (day_ago,))).fetchone())[0]
    regions_h = (await (await db.execute("SELECT COUNT(DISTINCT region) FROM probe_hourly WHERE hour_ts >= ?", (day_ago,))).fetchone())[0]
    sources = (await (await db.execute("SELECT COUNT(DISTINCT source_ip) FROM probes WHERE created_at >= ?", (day_ago,))).fetchone())[0]
    hourly_sources = (await (await db.execute("SELECT COALESCE(SUM(sources), 0) FROM probe_hourly WHERE hour_ts >= ?", (day_ago,))).fetchone())[0]
    return {
        "total_probes": raw_total + hourly_total,
        "today": raw_today + hourly_today,
        "regions": max(regions_raw, regions_h),
        "sources": sources + hourly_sources,
    }


async def add_subscriber(tg_id: int, region: str):
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO subscribers (tg_id, region, created_at) VALUES (?, ?, ?)",
        (tg_id, region, time.time()),
    )
    await db.commit()


async def remove_subscriber(tg_id: int):
    db = await get_db()
    await db.execute("DELETE FROM subscribers WHERE tg_id = ?", (tg_id,))
    await db.commit()


async def get_subscribers() -> list:
    db = await get_db()
    async with db.execute("SELECT tg_id, region FROM subscribers") as cur:
        return await cur.fetchall()


# --- Provider functions ---

async def create_provider(provider_id: str, name: str, secret_hash: str):
    db = await get_db()
    await db.execute(
        "INSERT INTO providers (id, name, secret_hash, created_at) VALUES (?, ?, ?, ?)",
        (provider_id, name, secret_hash, time.time()),
    )
    await db.commit()


async def get_provider(provider_id: str) -> dict | None:
    db = await get_db()
    async with db.execute("SELECT * FROM providers WHERE id = ?", (provider_id,)) as cur:
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_all_providers() -> list[dict]:
    db = await get_db()
    async with db.execute("SELECT * FROM providers ORDER BY created_at DESC") as cur:
        return [dict(r) for r in await cur.fetchall()]


async def increment_provider_probes(provider_id: str):
    db = await get_db()
    await db.execute(
        "UPDATE providers SET probe_count = probe_count + 1 WHERE id = ?",
        (provider_id,),
    )
    await db.commit()


async def get_provider_targets() -> list[dict]:
    db = await get_db()
    async with db.execute(
        "SELECT pt.*, p.name as provider_name "
        "FROM provider_targets pt JOIN providers p ON pt.provider_id = p.id "
        "WHERE pt.is_active = 1 AND p.is_active = 1 "
        "ORDER BY pt.created_at DESC"
    ) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def count_provider_targets(provider_id: str) -> int:
    db = await get_db()
    row = await (await db.execute(
        "SELECT COUNT(*) FROM provider_targets WHERE provider_id = ? AND is_active = 1",
        (provider_id,),
    )).fetchone()
    return row[0] if row else 0


async def add_provider_target(provider_id: str, label: str, ip: str, protocols_json: str):
    db = await get_db()
    await db.execute(
        "INSERT INTO provider_targets (provider_id, label, ip, protocols, created_at) VALUES (?, ?, ?, ?, ?)",
        (provider_id, label, ip, protocols_json, time.time()),
    )
    await db.commit()


RAW_RETENTION_HOURS = int(os.getenv("BP_RAW_RETENTION_HOURS", "6"))


async def aggregate_and_cleanup():
    """Roll up raw probes older than RAW_RETENTION_HOURS into hourly summaries, then delete them."""
    db = await get_db()
    cutoff = time.time() - RAW_RETENTION_HOURS * 3600

    await db.execute(
        "INSERT OR REPLACE INTO probe_hourly (hour_ts, region, protocol, total, ok, avg_ms, sources, isps) "
        "SELECT "
        "  CAST(created_at / 3600 AS INTEGER) * 3600, "
        "  region, protocol, "
        "  COUNT(*), SUM(success), "
        "  ROUND(AVG(CASE WHEN success THEN latency_ms END)), "
        "  COUNT(DISTINCT source_ip), "
        "  GROUP_CONCAT(DISTINCT isp) "
        "FROM probes WHERE created_at < ? "
        "GROUP BY CAST(created_at / 3600 AS INTEGER), region, protocol",
        (cutoff,),
    )

    result = await db.execute("SELECT changes()")
    row = await result.fetchone()
    agg_count = row[0] if row else 0

    await db.execute("DELETE FROM probes WHERE created_at < ?", (cutoff,))
    result = await db.execute("SELECT changes()")
    row = await result.fetchone()
    del_count = row[0] if row else 0

    await db.commit()
    return agg_count, del_count


async def cleanup_old_data(keep_days: int):
    """Delete hourly summaries older than keep_days."""
    db = await get_db()
    cutoff = time.time() - keep_days * 86400
    await db.execute("DELETE FROM probe_hourly WHERE hour_ts < ?", (cutoff,))
    await db.commit()


async def wal_checkpoint():
    """Force WAL checkpoint to reclaim disk space."""
    db = await get_db()
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
