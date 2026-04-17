<div align="center">

# ⚡ BlockPulse

### Crowdsourced мониторинг блокировок VPN-протоколов в России

[![Live Map](https://img.shields.io/badge/Live_Map-blockpulse.ru-FF6B35?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0xMiAyYTEwIDEwIDAgMSAwIDAgMjAgMTAgMTAgMCAwIDAgMC0yMHoiLz48cGF0aCBkPSJNMiAxMmgyMCIvPjxwYXRoIGQ9Ik0xMiAyYTEzIDE0IDAgMCAxIDQgMTAgMTMgMTQgMCAwIDEtNCAxMCAxMyAxNCAwIDAgMS00LTEwIDEzIDE0IDAgMCAxIDQtMTB6Ii8+PC9zdmc+)](https://blockpulse.ru)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/vpnstatuschecker_bot)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](#лицензия)

<br>

**Данные в реальном времени от сотен пользователей из разных регионов РФ.**
**Какой VPN-протокол работает у тебя прямо сейчас?**

[Открыть карту](https://blockpulse.ru) · [Telegram-бот](https://t.me/vpnstatuschecker_bot) · [Запустить проверку](#-быстрый-старт)

</div>

---

## 🔍 Что делает BlockPulse

BlockPulse — это открытая система мониторинга, которая показывает в реальном времени, какие VPN-протоколы блокируются в каждом регионе России. Пользователи запускают лёгкий probe-скрипт, который проверяет доступность протоколов из их сети — результаты агрегируются на интерактивной карте.

### Тестируемые протоколы

| Протокол | Порт | Транспорт | Описание |
|:---------|:-----|:----------|:---------|
| **VLESS Reality** | 443 | TCP + TLS | Маскировка под обычный HTTPS |
| **XHTTP Reality** #1 | 2083 | TCP + TLS | HTTP/2 мультиплексирование |
| **XHTTP Reality** #2 | 8743 | TCP + TLS | Альтернативный порт + SNI |
| **XHTTP Reality** #3 | 47832 | TCP + TLS | Нестандартный порт |
| **Hysteria2** | 29080 | UDP (QUIC) | QUIC-based протокол |

---

## 🚀 Быстрый старт

Запусти проверку за 30 секунд — скрипт сам проверит 5 протоколов и отправит результаты на карту:

```bash
# Linux / macOS
curl -sL https://blockpulse.ru/probe/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://blockpulse.ru/probe/install.ps1 | iex
```

> Зависимостей нет — только Python 3.8+. Исходный код probe [открыт](https://blockpulse.ru/probe.py).

---

## 🏗️ Архитектура

```
                    ┌─────────────────────────────────────────┐
                    │              blockpulse.ru               │
                    │         Caddy (auto-TLS, proxy)          │
                    └──────┬──────────────┬───────────────┬────┘
                           │              │               │
                    ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
                    │  React SPA  │ │  API       │ │  Telegram   │
                    │  Vite + TS  │ │  aiohttp   │ │  Bot        │
                    │  MapLibre   │ │  SQLite    │ │  aiogram 3  │
                    └─────────────┘ └─────┬──────┘ └─────────────┘
                                          │
              ┌───────────────────────────┬┴────────────────────────┐
              │                           │                         │
       ┌──────▼──────┐           ┌────────▼────────┐       ┌───────▼───────┐
       │  CLI Probe   │           │  Mini App Probe  │       │  Server Probe  │
       │  (Python)    │           │  (Browser JS)    │       │  (cron 5min)   │
       └──────────────┘           └──────────────────┘       └────────────────┘
              │                           │                         │
              └───── POST /api/probe ─────┴────── (HMAC signed) ───┘
```

---

## 🛠️ Стек

| Компонент | Технологии |
|:----------|:-----------|
| **Backend** | Python 3.12, aiohttp, aiogram 3, SQLite (aiosqlite), APScheduler |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4, MapLibre GL |
| **Probe** | Python stdlib — `socket`, `ssl`, `urllib` (0 зависимостей) |
| **Инфра** | Docker, Caddy 2.9 (auto-HTTPS), systemd |

---

## 📡 API

| Метод | Endpoint | Описание |
|:------|:---------|:---------|
| `GET` | `/api/pulse?hours=N` | Сводка по регионам и протоколам |
| `GET` | `/api/pulse/{region}?hours=N` | Детализация по региону |
| `GET` | `/api/pulse/timeline?hours=N&interval=M` | Временной ряд |
| `GET` | `/api/stats` | Общая статистика |
| `GET` | `/api/regions` | Список регионов с данными |
| `GET` | `/api/whoami` | GeoIP текущего IP |
| `POST` | `/api/probe` | Отправка результатов (HMAC-signed) |
| `GET` | `/probe.py` | Скачать probe-скрипт |

### Provider API (v1)

Для провайдеров VPN-сервисов, которые хотят добавить свои сервера в мониторинг:

| Метод | Endpoint | Auth | Описание |
|:------|:---------|:-----|:---------|
| `POST` | `/api/v1/probe` | Bearer | Отправка результатов от провайдера |
| `POST` | `/api/v1/targets` | Bearer | Добавить тестовый сервер |
| `GET` | `/api/v1/pulse` | — | Получить данные |

---

## 🔐 Безопасность

- **HMAC-подпись** — все probe-результаты подписаны общим секретом
- **Trusted proxy** — X-Forwarded-For принимается только от доверенных прокси
- **Rate limiting** — per-IP token bucket с автоочисткой (10 req/min)
- **CORS** — ограничен до `blockpulse.ru`
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options
- **Body size limit** — 64KB максимум на запрос
- **Container isolation** — non-root user в Docker

---

## 🐳 Развёртывание

```bash
git clone https://github.com/by-sonic/BlockPulse.git
cd BlockPulse

cp .env.example .env
# Отредактировать .env

docker compose up -d
```

### Переменные окружения

| Переменная | По умолчанию | Описание |
|:-----------|:-------------|:---------|
| `BP_BOT_TOKEN` | — | Telegram Bot API token |
| `BP_HMAC_SECRET` | — | Секрет для HMAC-подписи проб |
| `BP_API_PORT` | `8080` | Порт API-сервера |
| `BP_TARGET_IP` | — | IP тестового VPN-сервера |
| `BP_ADMIN_IDS` | — | Telegram ID администраторов |
| `BP_CORS_ORIGIN` | `https://blockpulse.ru` | Разрешённый CORS origin |
| `BP_TRUSTED_PROXIES` | `127.0.0.1,::1` | IP доверенных reverse proxy |
| `BP_TG_API_URL` | — | Прокси для Telegram API |
| `BP_GEOIP_URL` | `https://ipwho.is/{}` | URL GeoIP-провайдера |

### Фронтенд (dev)

```bash
cd webapp
npm install
npm run dev
```

---

## 📁 Структура

```
blockpulse/
├── main.py              # API + Telegram бот + scheduler
├── config.py            # Конфигурация из .env
├── db.py                # SQLite ORM
├── probes.py            # TLS/UDP probe-логика
├── probe/
│   ├── run.py           # CLI probe-скрипт
│   ├── install.sh       # Автоустановка (Linux/macOS)
│   └── install.ps1      # Автоустановка (Windows)
├── dashboard/           # Статичный дашборд (legacy)
├── miniapp/             # Telegram Mini App
├── webapp/              # React SPA (карта, графики)
│   ├── src/
│   │   ├── components/  # Map, ProtocolGrid, RegionTable...
│   │   └── pages/       # Home, MapDashboard, About
│   └── public/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

<div align="center">

## 🛡️ Нужен VPN, который работает?

### **[SonicVPN](https://t.me/bysonicvpn_bot)** — быстрый VPN с обходом блокировок

[![SonicVPN](https://img.shields.io/badge/SonicVPN-Подключиться-8B5CF6?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/bysonicvpn_bot)

**VLESS Reality + XHTTP + Hysteria2** — все протоколы, которые мониторит BlockPulse

✅ Автоматический выбор лучшего протокола
✅ Серверы в US и EU — низкий ping
✅ Клиенты для Windows, macOS, Android, iOS
✅ WARP exit — обход GeoIP-блокировок
✅ 24/7 поддержка в Telegram

**[@bysonicvpn_bot](https://t.me/bysonicvpn_bot)**

---

<sub>Made with ⚡ by Sonic · MIT License</sub>

</div>
