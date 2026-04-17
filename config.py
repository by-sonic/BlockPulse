import os

BOT_TOKEN = os.getenv("BP_BOT_TOKEN", "")
API_PORT = int(os.getenv("BP_API_PORT", "8080"))
API_HOST = os.getenv("BP_API_HOST", "")
DB_PATH = os.getenv("BP_DB_PATH", "data/blockpulse.db")
DASHBOARD_DIR = os.getenv("BP_DASHBOARD_DIR", "dashboard")
MINIAPP_DIR = os.getenv("BP_MINIAPP_DIR", "miniapp")

HMAC_SECRET = os.getenv("BP_HMAC_SECRET", "")
ADMIN_IDS = {int(x.strip()) for x in os.getenv("BP_ADMIN_IDS", "").split(",") if x.strip()}
CORS_ORIGIN = os.getenv("BP_CORS_ORIGIN", "*")
RETENTION_DAYS = int(os.getenv("BP_RETENTION_DAYS", "30"))
WEBAPP_URL = os.getenv("BP_WEBAPP_URL", "")
TG_API_URL = os.getenv("BP_TG_API_URL", "")

TEST_TARGETS = [
    {
        "id": "us1",
        "label": "US-1",
        "ip": os.getenv("BP_TARGET_IP", ""),
        "protocols": [
            {"name": "vless-reality", "port": 443, "sni": "www.samsung.com", "transport": "tcp"},
            {"name": "xhttp-1", "port": 2083, "sni": "www.microsoft.com", "transport": "tcp"},
            {"name": "xhttp-2", "port": 8743, "sni": "github.com", "transport": "tcp"},
            {"name": "xhttp-3", "port": 47832, "sni": "www.google.com", "transport": "tcp"},
            {"name": "hysteria2", "port": 29080, "sni": "", "transport": "udp"},
        ],
    }
]

VALID_PROTOCOLS = {
    p["name"]
    for t in TEST_TARGETS
    for p in t["protocols"]
}

VALID_TARGETS = {t["id"] for t in TEST_TARGETS}

MAX_PROBE_RESULTS = 20

GEOIP_URL = "http://ip-api.com/json/{}?fields=status,regionName,city,isp,query&lang=ru"

PROBE_INTERVAL = int(os.getenv("BP_PROBE_INTERVAL", "300"))
