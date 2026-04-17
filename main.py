#!/usr/bin/env python3
"""BlockPulse — crowdsourced VPN protocol blocking monitor."""
import asyncio
import collections
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import time as _time
from pathlib import Path

import aiohttp
from aiohttp import web
from aiogram import Bot, Dispatcher, Router
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)

import config
import db
import probes

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
log = logging.getLogger("blockpulse")

router = Router()
_server_ip_cache: str = ""

PROTO_SHORT = {
    "vless-reality": "VLESS",
    "xhttp-1": "XHTTP\u2081",
    "xhttp-2": "XHTTP\u2082",
    "xhttp-3": "XHTTP\u2083",
    "hysteria2": "HY2",
}
PROTO_ORDER = list(PROTO_SHORT.keys())
VALID_PROTOCOLS = {"vless-reality", "xhttp-1", "xhttp-2", "xhttp-3", "hysteria2"}
MAX_RESULTS = 20

_REGION_NORMALIZE: dict[str, str] = {
    "saint petersburg": "Санкт-Петербург",
    "sankt-peterburg": "Санкт-Петербург",
    "город санкт-петербург": "Санкт-Петербург",
    "moscow": "Москва",
    "moskva": "Москва",
    "город москва": "Москва",
    "moscow oblast": "Московская область",
    "leningrad oblast": "Ленинградская область",
    "krasnodar krai": "Краснодарский край",
    "sverdlovsk oblast": "Свердловская область",
    "novosibirsk oblast": "Новосибирская область",
    "tatarstan": "Татарстан",
    "republic of tatarstan": "Татарстан",
}


def _normalize_region(name: str) -> str:
    return _REGION_NORMALIZE.get(name.lower().strip(), name)


# ── Helpers ────────────────────────────────────────────────────────────────


def _get_real_ip(request: web.Request) -> str:
    """Extract real client IP, respecting trusted reverse proxies only."""
    remote = request.remote or ""
    if remote not in config.TRUSTED_PROXIES:
        return remote
    forwarded = request.headers.get("X-Forwarded-For", "")
    if not forwarded:
        return remote
    parts = [p.strip() for p in forwarded.split(",")]
    for ip in reversed(parts):
        if ip and ip not in config.TRUSTED_PROXIES:
            return ip
    return remote


def _safe_int(val, default: int = 0, lo: int | None = None, hi: int | None = None) -> int:
    try:
        n = int(val)
    except (TypeError, ValueError):
        return default
    if lo is not None:
        n = max(n, lo)
    if hi is not None:
        n = min(n, hi)
    return n


def _webapp_url() -> str:
    url = getattr(config, "WEBAPP_URL", "")
    if url:
        return url
    host = config.API_HOST or "localhost"
    return f"https://{host}/app"


def _dashboard_url() -> str:
    domain = os.getenv("BP_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    host = config.API_HOST or "localhost"
    return f"http://{host}:{config.API_PORT}"


# ── HMAC Probe Authentication ─────────────────────────────────────────────


def _compute_probe_hmac(results_json: str, timestamp: str) -> str:
    """HMAC-SHA256 of results JSON + timestamp using shared secret."""
    if not config.HMAC_SECRET:
        return ""
    msg = f"{timestamp}.{results_json}".encode()
    return hmac.new(config.HMAC_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def _verify_probe_hmac(body: dict, request: web.Request) -> bool:
    """Verify HMAC signature on probe submission. Skip if no secret configured."""
    if not config.HMAC_SECRET:
        return True
    sig = request.headers.get("X-Signature", "")
    ts = request.headers.get("X-Timestamp", "")
    if not sig or not ts:
        return False
    try:
        req_time = int(ts)
    except (TypeError, ValueError):
        return False
    if abs(_time.time() - req_time) > 300:
        return False
    results_json = json.dumps(body.get("results", []), separators=(",", ":"), sort_keys=True)
    expected = _compute_probe_hmac(results_json, ts)
    return hmac.compare_digest(sig, expected)


# ── Rate Limiting (per-IP token bucket with cleanup) ──────────────────────


class _TokenBucket:
    __slots__ = ("tokens", "last_refill", "rate", "capacity")

    def __init__(self, rate: float, capacity: float):
        self.tokens = capacity
        self.last_refill = _time.monotonic()
        self.rate = rate
        self.capacity = capacity

    def allow(self) -> bool:
        now = _time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.last_refill) * self.rate)
        self.last_refill = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


_buckets: dict[str, _TokenBucket] = {}
_BUCKETS_MAX = 50_000
_BUCKET_STALE_SECS = 600.0
_last_bucket_cleanup = _time.monotonic()

_provider_ips: dict[str, float] = {}
_PROVIDER_IP_TTL = 3600.0


def _cleanup_buckets():
    global _last_bucket_cleanup
    now = _time.monotonic()
    if now - _last_bucket_cleanup < 60:
        return
    _last_bucket_cleanup = now
    stale = [ip for ip, b in _buckets.items() if now - b.last_refill > _BUCKET_STALE_SECS]
    for ip in stale:
        del _buckets[ip]
    expired_providers = [ip for ip, ts in _provider_ips.items() if now - ts > _PROVIDER_IP_TTL]
    for ip in expired_providers:
        del _provider_ips[ip]


def _rate_limit_check(ip: str) -> bool:
    _cleanup_buckets()
    is_provider = ip in _provider_ips
    cap = 60.0 if is_provider else 10.0
    rate = cap / 60.0

    if len(_buckets) >= _BUCKETS_MAX and ip not in _buckets:
        return False

    if ip not in _buckets:
        _buckets[ip] = _TokenBucket(rate, cap)
    else:
        bucket = _buckets[ip]
        if bucket.capacity != cap:
            bucket.capacity = cap
            bucket.rate = rate

    return _buckets[ip].allow()


@web.middleware
async def rate_limit_mw(request: web.Request, handler):
    if request.method == "OPTIONS":
        return await handler(request)
    ip = _get_real_ip(request)
    if not _rate_limit_check(ip):
        return web.json_response({"error": "rate limited"}, status=429)
    return await handler(request)


# ── CORS Middleware ────────────────────────────────────────────────────────


@web.middleware
async def cors_mw(request: web.Request, handler):
    origin = config.CORS_ORIGIN
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Timestamp, X-Signature",
        })
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = origin
    return resp


# ── Security Headers Middleware ────────────────────────────────────────────


@web.middleware
async def security_headers_mw(request: web.Request, handler):
    resp = await handler(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.path.startswith("/api/"):
        resp.headers["Content-Security-Policy"] = "default-src 'none'"
    return resp


# ── GeoIP Cache (LRU via OrderedDict, max 10k entries, TTL 1h) ───────────


_geo_cache: collections.OrderedDict[str, tuple[dict, float]] = collections.OrderedDict()
_GEO_CACHE_MAX = 10_000
_GEO_TTL = 3600


async def geoip(ip: str) -> dict:
    now = _time.time()
    cached = _geo_cache.get(ip)
    if cached:
        data, ts = cached
        if now - ts < _GEO_TTL:
            _geo_cache.move_to_end(ip)
            return data
        del _geo_cache[ip]

    while len(_geo_cache) >= _GEO_CACHE_MAX:
        _geo_cache.popitem(last=False)

    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                config.GEOIP_URL.format(ip), timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                raw = await resp.json()
                if raw.get("success") is True:
                    conn = raw.get("connection", {})
                    result = {
                        "country": raw.get("country_code", ""),
                        "region": _normalize_region(raw.get("region", "")),
                        "city": raw.get("city", ""),
                        "isp": conn.get("isp", "") if isinstance(conn, dict) else "",
                    }
                    _geo_cache[ip] = (result, now)
                    return result
                if raw.get("status") == "success":
                    result = {
                        "country": raw.get("countryCode", ""),
                        "region": _normalize_region(raw.get("regionName", "")),
                        "city": raw.get("city", ""),
                        "isp": raw.get("isp", ""),
                    }
                    _geo_cache[ip] = (result, now)
                    return result
    except Exception as e:
        log.warning("GeoIP failed for %s: %s", ip, e)
    return {"country": "", "region": "", "city": "", "isp": ""}


# ── Provider Auth (Bearer <provider_id>:<token>, SHA-256 hashed) ──────────


async def _verify_provider(request: web.Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        provider_id, raw_token = token.split(":", 1)
    except ValueError:
        return None
    provider = await db.get_provider(provider_id)
    if not provider or not provider.get("is_active"):
        return None
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    if not secrets.compare_digest(token_hash, provider["secret_hash"]):
        return None
    _provider_ips[_get_real_ip(request)] = _time.monotonic()
    return provider_id


# ── Telegram Handlers ─────────────────────────────────────────────────────


@router.message(CommandStart())
async def cmd_start(msg: Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="\U0001f5fa \u041a\u0430\u0440\u0442\u0430 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a",
            url=_dashboard_url() + "/map",
        )],
        [InlineKeyboardButton(
            text="\U0001f50d \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043c\u043e\u0439 \u0440\u0435\u0433\u0438\u043e\u043d",
            callback_data="bp_myregion",
        )],
        [InlineKeyboardButton(
            text="\U0001f4ca \u041f\u0443\u043b\u044c\u0441",
            callback_data="bp_check",
        ),
        InlineKeyboardButton(
            text="\U0001f9ea \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c probe",
            callback_data="bp_probe",
        )],
        [InlineKeyboardButton(
            text="\U0001f514 \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430",
            callback_data="bp_subscribe",
        ),
        InlineKeyboardButton(
            text="\u2753 \u041a\u0430\u043a \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442",
            callback_data="bp_help",
        )],
        [InlineKeyboardButton(
            text="\U0001f6e1 SonicVPN \u2014 \u0431\u044b\u0441\u0442\u0440\u044b\u0439 VPN",
            url="https://t.me/bysonicvpn_bot",
        )],
    ])
    await msg.answer(
        "<b>BlockPulse</b> \u2014 \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a VPN-\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u043e\u0432 \u0432 \u0420\u0424\n\n"
        "Crowdsourced \u0434\u0430\u043d\u043d\u044b\u0435 \u043e\u0442 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0445 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439: "
        "\u043a\u0430\u043a\u043e\u0439 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0432 \u0442\u0432\u043e\u0451\u043c \u0440\u0435\u0433\u0438\u043e\u043d\u0435 \u043f\u0440\u044f\u043c\u043e \u0441\u0435\u0439\u0447\u0430\u0441.\n\n"
        f"\U0001f310 <a href=\"{_dashboard_url()}\">blockpulse.ru</a>",
        parse_mode=ParseMode.HTML,
        reply_markup=kb,
        disable_web_page_preview=True,
    )


@router.message(Command("check"))
async def cmd_check(msg: Message):
    pulse = await db.get_pulse(hours=1)
    if not pulse:
        pulse = await db.get_pulse(hours=24)
    if not pulse:
        await msg.answer(
            "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445. "
            "\u0411\u0443\u0434\u044c \u043f\u0435\u0440\u0432\u044b\u043c \u2014 /probe"
        )
        return

    by_region: dict[str, dict] = {}
    for row in pulse:
        rgn = row["region"] or "?"
        if rgn not in by_region:
            by_region[rgn] = {}
        rate = row["ok"] / row["total"] if row["total"] else 0
        prev = by_region[rgn].get(row["protocol"])
        if prev is None or rate > prev["rate"]:
            by_region[rgn][row["protocol"]] = {
                "rate": rate, "avg_ms": row["avg_ms"], "src": row["sources"],
            }

    xhttp_cols = ["xhttp-1", "xhttp-2", "xhttp-3"]
    header = f"{'\u0420\u0435\u0433\u0438\u043e\u043d':<18}{'VLESS':>6}{'XHTTP':>7}{'HY2':>6}"
    lines = [
        "<b>\u041f\u0443\u043b\u044c\u0441 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a</b>\n",
        f"<code>{header}</code>",
        "<code>" + "\u2500" * 37 + "</code>",
    ]

    def _icon(r):
        if r is None:
            return "  \u2014"
        if r >= 0.7:
            return " \u2705"
        if r >= 0.3:
            return " \u26a0\ufe0f"
        return " \u274c"

    for rgn in sorted(by_region):
        p = by_region[rgn]
        vless_rate = p.get("vless-reality", {}).get("rate")
        xhttp_rate = max((p.get(x, {}).get("rate", -1) for x in xhttp_cols), default=None)
        if xhttp_rate is not None and xhttp_rate < 0:
            xhttp_rate = None
        hy2_rate = p.get("hysteria2", {}).get("rate")
        name = rgn[:16]
        row_str = f"{name:<18}{_icon(vless_rate):>6}{_icon(xhttp_rate):>7}{_icon(hy2_rate):>6}"
        lines.append(f"<code>{row_str}</code>")

    stats = await db.get_stats()
    lines.append(
        f"\n\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432: {stats['sources']} | "
        f"\u0420\u0435\u0433\u0438\u043e\u043d\u043e\u0432: {stats['regions']}"
    )
    lines.append(f"\u041a\u0430\u0440\u0442\u0430: {_dashboard_url()}/map")
    await msg.answer("\n".join(lines), parse_mode=ParseMode.HTML)


@router.message(Command("probe"))
async def cmd_probe(msg: Message):
    url = _api_base_url()
    await msg.answer(
        "<b>\u0417\u0430\u043f\u0443\u0441\u0442\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 \u0441\u043e \u0441\u0432\u043e\u0435\u0433\u043e \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430</b>\n\n"
        "<b>Linux / macOS (\u0430\u0432\u0442\u043e-\u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430):</b>\n"
        f"<code>curl -sL {url}/probe/install.sh | bash</code>\n\n"
        "<b>Windows PowerShell:</b>\n"
        f"<code>irm {url}/probe/install.ps1 | iex</code>\n\n"
        "\u0421\u043a\u0440\u0438\u043f\u0442 \u0441\u0430\u043c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442 Python, \u0441\u043a\u0430\u0447\u0430\u0435\u0442 probe \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442 \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443.\n"
        f"\u041a\u043e\u0434 \u043e\u0442\u043a\u0440\u044b\u0442 \u2014 <a href=\"{url}/probe.py\">\u043f\u0440\u043e\u0432\u0435\u0440\u044c \u043f\u0435\u0440\u0435\u0434 \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u043c</a>.\n\n"
        f"\U0001f310 \u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b: <a href=\"{url}/map\">\u043a\u0430\u0440\u0442\u0430 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a</a>",
        parse_mode=ParseMode.HTML,
        reply_markup=_BACK_BTN,
        disable_web_page_preview=True,
    )


@router.message(Command("help"))
async def cmd_help(msg: Message):
    await msg.answer(
        "<b>\u041a\u0430\u043a \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 BlockPulse</b>\n\n"
        "1. \u0422\u044b \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0448\u044c probe-\u0441\u043a\u0440\u0438\u043f\u0442 "
        "\u043d\u0430 \u0441\u0432\u043e\u0451\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435\n"
        "2. \u0421\u043a\u0440\u0438\u043f\u0442 \u043f\u0440\u043e\u0431\u0443\u0435\u0442 TLS-handshake "
        "\u043a \u0442\u0435\u0441\u0442\u043e\u0432\u044b\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u0430\u043c "
        "\u043d\u0430 \u043f\u043e\u0440\u0442\u0430\u0445 \u0440\u0430\u0437\u043d\u044b\u0445 "
        "VPN-\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u043e\u0432\n"
        "3. \u0415\u0441\u043b\u0438 \u0422\u0421\u041f\u0423 \u0431\u043b\u043e\u043a\u0438\u0440\u0443\u0435\u0442 "
        "\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u2014 handshake \u043d\u0435 \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442 "
        "(timeout/reset)\n"
        "4. \u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 + \u0442\u0432\u043e\u0439 "
        "\u0440\u0435\u0433\u0438\u043e\u043d/\u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440 "
        "(\u043f\u043e GeoIP) \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f "
        "\u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\n"
        "5. \u0414\u0430\u043d\u043d\u044b\u0435 \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u0443\u044e\u0442\u0441\u044f "
        "\u0432 \u043a\u0430\u0440\u0442\u0443 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a "
        "\u043f\u043e \u0440\u0435\u0433\u0438\u043e\u043d\u0430\u043c\n\n"
        "\u0422\u0435\u0441\u0442\u0438\u0440\u0443\u0435\u043c\u044b\u0435 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u044b:\n"
        "\u2022 <b>VLESS Reality</b> (TCP :443) \u2014 \u043c\u0430\u0441\u043a\u0438\u0440\u043e\u0432\u043a\u0430 "
        "\u043f\u043e\u0434 \u043e\u0431\u044b\u0447\u043d\u044b\u0439 HTTPS\n"
        "\u2022 <b>XHTTP Reality</b> (3 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430, "
        "\u0440\u0430\u0437\u043d\u044b\u0435 \u043f\u043e\u0440\u0442\u044b/SNI)\n"
        "\u2022 <b>Hysteria2</b> (UDP) \u2014 QUIC-based\n\n"
        "\u041a\u043e\u0434 \u043e\u0442\u043a\u0440\u044b\u0442. \u041d\u0438\u043a\u0430\u043a\u0438\u0435 "
        "\u043b\u0438\u0447\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 "
        "\u0441\u043e\u0431\u0438\u0440\u0430\u044e\u0442\u0441\u044f \u2014 \u0442\u043e\u043b\u044c\u043a\u043e "
        "IP \u0434\u043b\u044f \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u044f "
        "\u0440\u0435\u0433\u0438\u043e\u043d\u0430.",
        parse_mode=ParseMode.HTML,
    )


@router.message(Command("subscribe"))
async def cmd_subscribe(msg: Message):
    parts = msg.text.split(maxsplit=1)
    region = parts[1].strip() if len(parts) > 1 else ""
    if not region:
        regions = await db.get_regions()
        if regions:
            txt = "\n".join(f"\u2022 <code>{r}</code>" for r in regions)
            await msg.answer(
                f"\u0423\u043a\u0430\u0436\u0438 \u0440\u0435\u0433\u0438\u043e\u043d:\n"
                f"/subscribe \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435\n\n"
                f"\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435:\n{txt}",
                parse_mode=ParseMode.HTML,
            )
        else:
            await msg.answer(
                "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 "
                "\u043f\u043e \u0440\u0435\u0433\u0438\u043e\u043d\u0430\u043c. "
                "\u0417\u0430\u043f\u0443\u0441\u0442\u0438 /probe \u043f\u0435\u0440\u0432\u044b\u043c!"
            )
        return
    known = await db.get_regions()
    if known and region not in known:
        await msg.answer(
            f"\u0420\u0435\u0433\u0438\u043e\u043d <b>{region}</b> \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.\n"
            f"\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435: /subscribe",
            parse_mode=ParseMode.HTML,
        )
        return
    await db.add_subscriber(msg.from_user.id, region)
    await msg.answer(
        f"\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u043d\u0430 <b>{region}</b> "
        f"\u0430\u043a\u0442\u0438\u0432\u043d\u0430.\n\u041e\u0442\u043f\u0438\u0441\u043a\u0430: /unsubscribe",
        parse_mode=ParseMode.HTML,
    )


@router.message(Command("unsubscribe"))
async def cmd_unsubscribe(msg: Message):
    await db.remove_subscriber(msg.from_user.id)
    await msg.answer("\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u0430.")


@router.message(Command("register_provider"))
async def cmd_register_provider(msg: Message):
    if msg.from_user.id not in config.ADMIN_IDS:
        return
    parts = msg.text.split(maxsplit=1)
    name = parts[1].strip() if len(parts) > 1 else ""
    if not name:
        await msg.answer("Usage: /register_provider &lt;name&gt;", parse_mode=ParseMode.HTML)
        return
    provider_id = secrets.token_hex(4)
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    await db.create_provider(provider_id, name, token_hash)
    api_key = f"{provider_id}:{raw_token}"
    await msg.answer(
        f"Provider <b>{name}</b> \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d.\n\n"
        f"API Key (\u043f\u043e\u043a\u0430\u0436\u0438 \u043e\u0434\u0438\u043d \u0440\u0430\u0437):\n"
        f"<code>{api_key}</code>\n\n"
        f"Header: <code>Authorization: Bearer {api_key}</code>",
        parse_mode=ParseMode.HTML,
    )


@router.message(Command("providers"))
async def cmd_providers(msg: Message):
    if msg.from_user.id not in config.ADMIN_IDS:
        return
    providers_list = await db.get_all_providers()
    if not providers_list:
        await msg.answer("\u041d\u0435\u0442 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u043e\u0432.")
        return
    lines = ["<b>\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b:</b>\n"]
    for p in providers_list:
        status = "\u2705" if p["is_active"] else "\u23f8"
        lines.append(
            f"{status} <b>{p['name']}</b> ({p['id']}) \u2014 "
            f"{p['probe_count']} \u043f\u0440\u043e\u0432\u0435\u0440\u043e\u043a"
        )
    await msg.answer("\n".join(lines), parse_mode=ParseMode.HTML)


_BACK_BTN = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text="\u2190 \u041d\u0430\u0437\u0430\u0434", callback_data="bp_home")],
])


@router.callback_query(lambda c: c.data == "bp_home")
async def cb_home(cb: CallbackQuery):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="\U0001f5fa \u041a\u0430\u0440\u0442\u0430 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a",
            url=_dashboard_url() + "/map",
        )],
        [InlineKeyboardButton(
            text="\U0001f50d \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043c\u043e\u0439 \u0440\u0435\u0433\u0438\u043e\u043d",
            callback_data="bp_myregion",
        )],
        [InlineKeyboardButton(
            text="\U0001f4ca \u041f\u0443\u043b\u044c\u0441",
            callback_data="bp_check",
        ),
        InlineKeyboardButton(
            text="\U0001f9ea \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c probe",
            callback_data="bp_probe",
        )],
        [InlineKeyboardButton(
            text="\U0001f514 \u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430",
            callback_data="bp_subscribe",
        ),
        InlineKeyboardButton(
            text="\u2753 \u041a\u0430\u043a \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442",
            callback_data="bp_help",
        )],
        [InlineKeyboardButton(
            text="\U0001f6e1 SonicVPN \u2014 \u0431\u044b\u0441\u0442\u0440\u044b\u0439 VPN",
            url="https://t.me/bysonicvpn_bot",
        )],
    ])
    await cb.message.edit_text(
        "<b>BlockPulse</b> \u2014 \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a VPN-\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u043e\u0432 \u0432 \u0420\u0424\n\n"
        "Crowdsourced \u0434\u0430\u043d\u043d\u044b\u0435 \u043e\u0442 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0445 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439: "
        "\u043a\u0430\u043a\u043e\u0439 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0432 \u0442\u0432\u043e\u0451\u043c \u0440\u0435\u0433\u0438\u043e\u043d\u0435 \u043f\u0440\u044f\u043c\u043e \u0441\u0435\u0439\u0447\u0430\u0441.\n\n"
        f"\U0001f310 <a href=\"{_dashboard_url()}\">blockpulse.ru</a>",
        parse_mode=ParseMode.HTML,
        reply_markup=kb,
        disable_web_page_preview=True,
    )
    await cb.answer()


@router.callback_query(lambda c: c.data == "bp_myregion")
async def cb_myregion(cb: CallbackQuery):
    await cb.answer("\U0001f50d \u041e\u043f\u0440\u0435\u0434\u0435\u043b\u044f\u044e \u0440\u0435\u0433\u0438\u043e\u043d...")
    server_ip = await _get_server_ip()
    if not server_ip:
        await cb.message.edit_text(
            "\u274c \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c IP \u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u043f\u043e\u0437\u0436\u0435.",
            reply_markup=_BACK_BTN,
        )
        return

    geo = await geoip(server_ip)
    region = geo.get("region", "")
    if not region:
        await cb.message.edit_text(
            "\u274c \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u0440\u0435\u0433\u0438\u043e\u043d. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u043f\u043e\u0437\u0436\u0435.",
            reply_markup=_BACK_BTN,
        )
        return

    pulse = await db.get_pulse(hours=6)
    if not pulse:
        pulse = await db.get_pulse(hours=24)

    region_data: dict[str, dict] = {}
    for row in (pulse or []):
        if row["region"] != region:
            continue
        rate = row["ok"] / row["total"] if row["total"] else 0
        region_data[row["protocol"]] = {
            "rate": rate,
            "avg_ms": row["avg_ms"],
        }

    def _status(r: float | None) -> str:
        if r is None:
            return "\u2796 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445"
        if r >= 0.7:
            return f"\u2705 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 ({round(r*100)}%)"
        if r >= 0.3:
            return f"\u26a0\ufe0f \u043d\u0435\u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e ({round(r*100)}%)"
        return f"\u274c \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043a\u0430 ({round(r*100)}%)"

    lines = [f"\U0001f4cd <b>{region}</b>\n"]
    if region_data:
        for proto, label in PROTO_SHORT.items():
            d = region_data.get(proto)
            rate = d["rate"] if d else None
            ms_str = f" \u2022 {d['avg_ms']}ms" if d and d["avg_ms"] else ""
            lines.append(f"  {label}: {_status(rate)}{ms_str}")
        lines.append(f"\n\U0001f5fa <a href=\"{_dashboard_url()}/map\">\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435 \u043d\u0430 \u043a\u0430\u0440\u0442\u0435</a>")
    else:
        lines.append("\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0440\u0435\u0433\u0438\u043e\u043d\u0430.")
        lines.append("\u0417\u0430\u043f\u0443\u0441\u0442\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 \u2014 \u0431\u0443\u0434\u044c \u043f\u0435\u0440\u0432\u044b\u043c! \U0001f447")
        lines.append("")
        url = _api_base_url()
        lines.append(f"<code>curl -sL {url}/probe/install.sh | bash</code>")

    await cb.message.edit_text(
        "\n".join(lines),
        parse_mode=ParseMode.HTML,
        reply_markup=_BACK_BTN,
        disable_web_page_preview=True,
    )


@router.callback_query(lambda c: c.data == "bp_check")
async def cb_check(cb: CallbackQuery):
    pulse = await db.get_pulse(hours=1)
    if not pulse:
        pulse = await db.get_pulse(hours=24)
    if not pulse:
        await cb.message.edit_text(
            "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445. "
            "\u0417\u0430\u043f\u0443\u0441\u0442\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 \u0447\u0435\u0440\u0435\u0437 Mini App!",
            reply_markup=_BACK_BTN,
        )
        await cb.answer()
        return

    by_region: dict[str, dict] = {}
    for row in pulse:
        rgn = row["region"] or "?"
        if rgn not in by_region:
            by_region[rgn] = {}
        rate = row["ok"] / row["total"] if row["total"] else 0
        prev = by_region[rgn].get(row["protocol"])
        if prev is None or rate > prev["rate"]:
            by_region[rgn][row["protocol"]] = {
                "rate": rate, "avg_ms": row["avg_ms"], "src": row["sources"],
            }

    xhttp_cols = ["xhttp-1", "xhttp-2", "xhttp-3"]
    header = f"{'\u0420\u0435\u0433\u0438\u043e\u043d':<18}{'VLESS':>6}{'XHTTP':>7}{'HY2':>6}"
    lines = [
        "<b>\u041f\u0443\u043b\u044c\u0441 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a</b>\n",
        f"<code>{header}</code>",
        "<code>" + "\u2500" * 37 + "</code>",
    ]

    def _icon(r):
        if r is None:
            return "  \u2014"
        if r >= 0.7:
            return " \u2705"
        if r >= 0.3:
            return " \u26a0\ufe0f"
        return " \u274c"

    for rgn in sorted(by_region):
        p = by_region[rgn]
        vless_rate = p.get("vless-reality", {}).get("rate")
        xhttp_rate = max((p.get(x, {}).get("rate", -1) for x in xhttp_cols), default=None)
        if xhttp_rate is not None and xhttp_rate < 0:
            xhttp_rate = None
        hy2_rate = p.get("hysteria2", {}).get("rate")
        name = rgn[:16]
        row_str = f"{name:<18}{_icon(vless_rate):>6}{_icon(xhttp_rate):>7}{_icon(hy2_rate):>6}"
        lines.append(f"<code>{row_str}</code>")

    stats = await db.get_stats()
    lines.append(
        f"\n\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432: {stats['sources']} | "
        f"\u0420\u0435\u0433\u0438\u043e\u043d\u043e\u0432: {stats['regions']}"
    )
    await cb.message.edit_text(
        "\n".join(lines), parse_mode=ParseMode.HTML, reply_markup=_BACK_BTN,
    )
    await cb.answer()


@router.callback_query(lambda c: c.data == "bp_probe")
async def cb_probe(cb: CallbackQuery):
    url = _dashboard_url()
    await cb.message.edit_text(
        "<b>\u0417\u0430\u043f\u0443\u0441\u0442\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 "
        "\u0441\u043e \u0441\u0432\u043e\u0435\u0433\u043e \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0430</b>\n\n"
        "<b>Linux / macOS:</b>\n"
        f"<code>curl -sL {url}/probe.py | python3</code>\n\n"
        "<b>Windows (PowerShell):</b>\n"
        f"<code>(irm {url}/probe.py) | python</code>",
        parse_mode=ParseMode.HTML,
        reply_markup=_BACK_BTN,
    )
    await cb.answer()


@router.callback_query(lambda c: c.data == "bp_help")
async def cb_help(cb: CallbackQuery):
    await cb.message.edit_text(
        "<b>\u041a\u0430\u043a \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 BlockPulse</b>\n\n"
        "1. \u0422\u044b \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0448\u044c probe-\u0441\u043a\u0440\u0438\u043f\u0442 "
        "\u043d\u0430 \u0441\u0432\u043e\u0451\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435\n"
        "2. \u0421\u043a\u0440\u0438\u043f\u0442 \u043f\u0440\u043e\u0431\u0443\u0435\u0442 TLS-handshake "
        "\u043a \u0442\u0435\u0441\u0442\u043e\u0432\u044b\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u0430\u043c\n"
        "3. \u0415\u0441\u043b\u0438 \u0422\u0421\u041f\u0423 \u0431\u043b\u043e\u043a\u0438\u0440\u0443\u0435\u0442 "
        "\u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b \u2014 handshake \u043d\u0435 \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442\n"
        "4. \u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 + \u0440\u0435\u0433\u0438\u043e\u043d/ISP "
        "\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\n"
        "5. \u0414\u0430\u043d\u043d\u044b\u0435 \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u0443\u044e\u0442\u0441\u044f "
        "\u0432 \u043a\u0430\u0440\u0442\u0443 \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043e\u043a\n\n"
        "<b>\u0422\u0435\u0441\u0442\u0438\u0440\u0443\u0435\u043c\u044b\u0435 \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b\u044b:</b>\n"
        "\u2022 VLESS Reality (TCP :443)\n"
        "\u2022 XHTTP Reality (3 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430)\n"
        "\u2022 Hysteria2 (UDP, QUIC)\n\n"
        "\u041a\u043e\u0434 \u043e\u0442\u043a\u0440\u044b\u0442. \u041d\u0438\u043a\u0430\u043a\u0438\u0435 "
        "\u043b\u0438\u0447\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 \u0441\u043e\u0431\u0438\u0440\u0430\u044e\u0442\u0441\u044f.",
        parse_mode=ParseMode.HTML,
        reply_markup=_BACK_BTN,
    )
    await cb.answer()


@router.callback_query(lambda c: c.data == "bp_subscribe")
async def cb_subscribe(cb: CallbackQuery):
    regions = await db.get_regions()
    if regions:
        txt = "\n".join(f"\u2022 <code>{r}</code>" for r in regions)
        await cb.message.edit_text(
            "<b>\u041f\u043e\u0434\u043f\u0438\u0441\u043a\u0430 \u043d\u0430 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f</b>\n\n"
            "\u041e\u0442\u043f\u0440\u0430\u0432\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u0443:\n"
            "<code>/subscribe \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435_\u0440\u0435\u0433\u0438\u043e\u043d\u0430</code>\n\n"
            f"\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 \u0440\u0435\u0433\u0438\u043e\u043d\u044b:\n{txt}",
            parse_mode=ParseMode.HTML,
            reply_markup=_BACK_BTN,
        )
    else:
        await cb.message.edit_text(
            "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u043e \u0440\u0435\u0433\u0438\u043e\u043d\u0430\u043c. "
            "\u0417\u0430\u043f\u0443\u0441\u0442\u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 \u043f\u0435\u0440\u0432\u044b\u043c!",
            reply_markup=_BACK_BTN,
        )
    await cb.answer()


# ── HTTP Handlers ─────────────────────────────────────────────────────────


async def h_index(request: web.Request):
    p = Path(config.DASHBOARD_DIR) / "index.html"
    if p.exists():
        return web.FileResponse(p)
    return web.Response(text="BlockPulse API", content_type="text/plain")


async def h_miniapp(request: web.Request):
    p = Path(config.MINIAPP_DIR) / "index.html"
    if p.exists():
        return web.FileResponse(p)
    return web.Response(text="Mini App not found", status=404)


async def h_whoami(request: web.Request):
    ip = _get_real_ip(request)
    geo = await geoip(ip)
    return web.json_response({
        "ip": ip,
        "region": geo.get("region", ""),
        "city": geo.get("city", ""),
        "isp": geo.get("isp", ""),
    })


async def h_pulse(request: web.Request):
    hours = _safe_int(request.query.get("hours", "1"), default=1, lo=1, hi=168)
    pulse = await db.get_pulse(hours)
    stats = await db.get_stats()
    return web.json_response({"pulse": pulse, "stats": stats, "window_hours": hours})


async def h_pulse_region(request: web.Request):
    region = request.match_info["region"]
    hours = _safe_int(request.query.get("hours", "6"), default=6, lo=1, hi=168)
    data = await db.get_pulse_region(region, hours)
    return web.json_response({"region": region, "protocols": data, "window_hours": hours})


async def h_pulse_timeline(request: web.Request):
    hours = _safe_int(request.query.get("hours", "24"), default=24, lo=1, hi=168)
    interval = _safe_int(request.query.get("interval", "1"), default=1, lo=1, hi=24)
    buckets = await db.get_pulse_timeline(hours, interval)
    return web.json_response({"buckets": buckets, "hours": hours, "interval": interval})


async def h_regions(request: web.Request):
    return web.json_response({"regions": await db.get_regions()})


async def h_stats(request: web.Request):
    return web.json_response(await db.get_stats())


async def h_targets(request: web.Request):
    targets = []
    for t in config.TEST_TARGETS:
        if t["ip"]:
            targets.append({
                "id": t["id"],
                "label": t["label"],
                "ip": t["ip"],
                "protocols": t["protocols"],
            })
    for row in await db.get_provider_targets():
        targets.append({
            "id": f"p_{row['id']}",
            "label": row["label"],
            "ip": row["ip"],
            "protocols": json.loads(row["protocols"]),
        })
    return web.json_response({"targets": targets})


def _validate_probe_results(results: list) -> list[dict]:
    rows = []
    for r in results[:MAX_RESULTS]:
        protocol = r.get("protocol", "")
        if protocol not in VALID_PROTOCOLS:
            continue
        port = _safe_int(r.get("port"), default=0)
        if port < 1 or port > 65535:
            continue
        rows.append({
            "target_id": str(r.get("target_id", ""))[:32],
            "protocol": protocol,
            "port": port,
            "success": 1 if r.get("success") else 0,
            "latency_ms": _safe_int(r.get("latency_ms"), default=0, lo=0, hi=60000),
            "error": str(r.get("error", ""))[:200],
        })
    return rows


async def h_probe_submit(request: web.Request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    if not _verify_probe_hmac(body, request):
        return web.json_response({"error": "invalid signature"}, status=403)

    ip = _get_real_ip(request)
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return web.json_response({"error": "cannot determine source IP"}, status=400)

    results = body.get("results")
    if not isinstance(results, list) or not results:
        return web.json_response({"error": "need results[]"}, status=400)

    geo = await geoip(ip)

    if geo.get("country") != "RU":
        log.info("Rejected non-RU probe from %s (country=%s)", ip, geo.get("country", "?"))
        return web.json_response({"error": "only Russian IPs accepted"}, status=403)

    validated = _validate_probe_results(results)
    if not validated:
        return web.json_response({"error": "no valid results"}, status=400)

    rows = [{
        "source_ip": ip,
        "region": geo.get("region", ""),
        "city": geo.get("city", ""),
        "isp": geo.get("isp", ""),
        "source_type": "user",
        **v,
    } for v in validated]

    await db.insert_probe_batch(rows)
    log.info(
        "Probe from %s (%s / %s): %d results",
        ip, geo.get("region", "?"), geo.get("isp", "?"), len(rows),
    )
    return web.json_response({"ok": True, **geo})


def _api_base_url() -> str:
    domain = os.getenv("BP_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    if config.API_HOST:
        return f"http://{config.API_HOST}:{config.API_PORT}"
    return "http://localhost:8080"


async def h_probe_script(request: web.Request):
    p = Path("probe/run.py")
    if not p.exists():
        return web.Response(text="# not found", status=404)
    text = p.read_text(encoding="utf-8")
    api_url = _api_base_url()
    text = text.replace('"__API_URL__"', json.dumps(api_url))
    text = text.replace('"__HMAC_SECRET__"', json.dumps(config.HMAC_SECRET))
    targets = []
    for t in config.TEST_TARGETS:
        if t["ip"]:
            targets.append({
                "id": t["id"], "ip": t["ip"],
                "protos": [(p["name"], p["port"], p.get("sni", ""), p["transport"]) for p in t["protocols"]],
            })
    text = text.replace('"__TARGETS__"', json.dumps(targets))
    return web.Response(text=text, content_type="text/plain", charset="utf-8")


async def h_probe_install_sh(request: web.Request):
    p = Path("probe/install.sh")
    if not p.exists():
        return web.Response(text="# not found", status=404)
    text = p.read_text(encoding="utf-8")
    text = text.replace("__API_URL__", _api_base_url())
    return web.Response(text=text, content_type="text/plain", charset="utf-8")


async def h_probe_install_ps1(request: web.Request):
    p = Path("probe/install.ps1")
    if not p.exists():
        return web.Response(text="# not found", status=404)
    text = p.read_text(encoding="utf-8")
    text = text.replace("__API_URL__", _api_base_url())
    return web.Response(text=text, content_type="text/plain", charset="utf-8")


# ── Provider API Handlers ─────────────────────────────────────────────────


async def h_provider_probe(request: web.Request):
    provider_id = await _verify_provider(request)
    if not provider_id:
        return web.json_response({"error": "unauthorized"}, status=401)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    source_ip = str(body.get("source_ip", "")).strip()
    try:
        ipaddress.ip_address(source_ip)
    except ValueError:
        return web.json_response({"error": "invalid source_ip"}, status=400)

    results = body.get("results")
    if not isinstance(results, list) or not results:
        return web.json_response({"error": "need results[]"}, status=400)

    geo = await geoip(source_ip)
    validated = _validate_probe_results(results)
    if not validated:
        return web.json_response({"error": "no valid results"}, status=400)

    rows = [{
        "source_ip": source_ip,
        "region": geo.get("region", ""),
        "city": geo.get("city", ""),
        "isp": geo.get("isp", ""),
        "source_type": "provider",
        **v,
    } for v in validated]

    await db.insert_probe_batch(rows)
    await db.increment_provider_probes(provider_id)
    log.info(
        "Provider %s probe from %s (%s): %d results",
        provider_id, source_ip, geo.get("region", "?"), len(rows),
    )
    return web.json_response({"ok": True, "accepted": len(rows)})


async def h_provider_add_target(request: web.Request):
    provider_id = await _verify_provider(request)
    if not provider_id:
        return web.json_response({"error": "unauthorized"}, status=401)

    count = await db.count_provider_targets(provider_id)
    if count >= config.MAX_PROVIDER_TARGETS:
        return web.json_response({"error": "target limit reached"}, status=429)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    label = str(body.get("label", "")).strip()[:64]
    ip_str = str(body.get("ip", "")).strip()
    protocols = body.get("protocols", [])

    if not label or not ip_str:
        return web.json_response({"error": "need label and ip"}, status=400)
    try:
        ipaddress.ip_address(ip_str)
    except ValueError:
        return web.json_response({"error": "invalid ip"}, status=400)
    if not isinstance(protocols, list):
        return web.json_response({"error": "protocols must be a list"}, status=400)

    valid_protos = []
    for p in protocols[:20]:
        if not isinstance(p, dict):
            continue
        name = p.get("name", "")
        port = _safe_int(p.get("port"), default=0)
        if name not in VALID_PROTOCOLS or port < 1 or port > 65535:
            continue
        valid_protos.append({
            "name": name,
            "port": port,
            "sni": str(p.get("sni", ""))[:128],
            "transport": "udp" if name == "hysteria2" else "tcp",
        })

    await db.add_provider_target(provider_id, label, ip_str, json.dumps(valid_protos))
    log.info("Provider %s added target %s (%s)", provider_id, label, ip_str)
    return web.json_response({"ok": True})


# ── App Factory ───────────────────────────────────────────────────────────


_MAX_BODY = 64 * 1024


def create_app() -> web.Application:
    app = web.Application(
        middlewares=[rate_limit_mw, cors_mw, security_headers_mw],
        client_max_size=_MAX_BODY,
    )
    app.router.add_get("/", h_index)
    app.router.add_get("/app", h_miniapp)
    app.router.add_get("/app/", h_miniapp)
    app.router.add_get("/api/whoami", h_whoami)
    app.router.add_get("/api/pulse", h_pulse)
    app.router.add_get("/api/pulse/timeline", h_pulse_timeline)
    app.router.add_get("/api/pulse/{region}", h_pulse_region)
    app.router.add_get("/api/regions", h_regions)
    app.router.add_get("/api/stats", h_stats)
    app.router.add_get("/api/targets", h_targets)
    app.router.add_post("/api/probe", h_probe_submit)
    app.router.add_get("/probe.py", h_probe_script)
    app.router.add_get("/probe/install.sh", h_probe_install_sh)
    app.router.add_get("/probe/install.ps1", h_probe_install_ps1)
    # Provider API v1
    app.router.add_post("/api/v1/probe", h_provider_probe)
    app.router.add_get("/api/v1/pulse", h_pulse)
    app.router.add_get("/api/v1/pulse/{region}", h_pulse_region)
    app.router.add_get("/api/v1/targets", h_targets)
    app.router.add_post("/api/v1/targets", h_provider_add_target)
    # Static files
    app.router.add_static("/static", config.DASHBOARD_DIR, show_index=False)
    return app


# ── Periodic Tasks ────────────────────────────────────────────────────────


async def _get_server_ip() -> str:
    global _server_ip_cache
    if _server_ip_cache:
        return _server_ip_cache
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                "https://api.ipify.org?format=json",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                _server_ip_cache = (await r.json()).get("ip", "")
    except Exception:
        pass
    return _server_ip_cache


async def periodic_probes():
    await asyncio.sleep(10)
    last_cleanup = _time.time()
    while True:
        try:
            server_ip = await _get_server_ip()
            if not server_ip:
                log.warning("Cannot determine server IP, skipping probe")
                await asyncio.sleep(60)
                continue

            geo = await geoip(server_ip)
            all_results = []
            for target in config.TEST_TARGETS:
                if not target["ip"]:
                    continue
                results = await probes.run_target_probes(target)
                rows = [{
                    "source_ip": server_ip,
                    "region": geo.get("region", ""),
                    "city": geo.get("city", ""),
                    "isp": geo.get("isp", ""),
                    "source_type": "server",
                    **r,
                } for r in results]
                await db.insert_probe_batch(rows)
                all_results.extend(results)

            ok_count = sum(1 for r in all_results if r["success"])
            log.info(
                "Server probe from %s (%s): %d/%d ok",
                server_ip, geo.get("region", "?"), ok_count, len(all_results),
            )
        except Exception as e:
            log.error("Periodic probe error: %s", e)

        now = _time.time()
        if now - last_cleanup >= 3600:
            try:
                agg, deleted = await db.aggregate_and_cleanup()
                if deleted:
                    log.info("Aggregated %d hourly buckets, deleted %d raw rows", agg, deleted)
                await db.cleanup_old_data(config.RETENTION_DAYS)
                await db.wal_checkpoint()
            except Exception as e:
                log.error("Cleanup error: %s", e)
            last_cleanup = now

        await asyncio.sleep(config.PROBE_INTERVAL)


# ── Entry Point ───────────────────────────────────────────────────────────


async def _bot_polling_loop(bot: Bot, dp: Dispatcher):
    while True:
        try:
            log.info("Starting bot polling...")
            await dp.start_polling(bot)
            break
        except Exception as e:
            log.error("Bot polling failed: %s — retrying in 30s", e)
            await asyncio.sleep(30)


async def main():
    if not config.HMAC_SECRET:
        log.warning("BP_HMAC_SECRET not set — probe submissions will not be verified!")

    await db.init_db()
    log.info("Database initialized")

    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.API_PORT)
    await site.start()
    log.info("API on :%d", config.API_PORT)

    asyncio.create_task(periodic_probes())

    if config.BOT_TOKEN:
        session = None
        if config.TG_API_URL:
            api_server = TelegramAPIServer.from_base(config.TG_API_URL)
            session = AiohttpSession(api=api_server)
            log.info("Using Telegram API proxy: %s", config.TG_API_URL)
        bot = Bot(token=config.BOT_TOKEN, session=session)
        dp = Dispatcher()
        dp.include_router(router)
        asyncio.create_task(_bot_polling_loop(bot, dp))
    else:
        log.warning("No BOT_TOKEN — running API-only mode")

    stop = asyncio.Event()
    try:
        await stop.wait()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
