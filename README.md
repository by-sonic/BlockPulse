# BlockPulse

Crowdsourced мониторинг блокировок VPN-протоколов в РФ. Интерактивная карта в реальном времени.

**[blockpulse.ru](https://blockpulse.ru)** | **[Telegram-бот](https://t.me/vpnstatuschecker_bot)**

## Что это

BlockPulse собирает данные о доступности VPN-протоколов от реальных пользователей из разных регионов России и отображает их на интерактивной карте. Показывает какой протокол работает, где и когда.

### Тестируемые протоколы

| Протокол | Порт | Транспорт |
|----------|------|-----------|
| VLESS Reality | 443 | TCP+TLS |
| XHTTP #1 | 2083 | TCP+TLS |
| XHTTP #2 | 8743 | TCP+TLS |
| XHTTP #3 | 47832 | TCP+TLS |
| Hysteria2 | 29080 | UDP |

## Быстрый старт — запусти проверку

```bash
# Linux / macOS
curl -sL https://blockpulse.ru/probe/install.sh | bash

# Windows PowerShell
irm https://blockpulse.ru/probe/install.ps1 | iex
```

Скрипт автоматически установит Python (если нет), скачает probe, проверит 5 протоколов и отправит результаты на карту. Занимает ~30 секунд.

## Архитектура

```
┌──────────────┐    POST /api/probe    ┌────────────────┐
│  CLI probe   │ ───────────────────>  │   API (aiohttp) │
│  (Python)    │                       │   SQLite DB     │
└──────────────┘                       │   Telegram bot  │
                                       └────────────────┘
┌──────────────┐    GET /api/pulse            │
│  React SPA   │ <────────────────────        │ каждые 5 мин
│  (Vite+TS)   │                              ▼
└──────────────┘                       server-side probe
```

## Стек

**Backend:** Python 3.12, aiohttp, aiogram, SQLite (aiosqlite)
**Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, MapLibre GL
**Probe:** Python stdlib (socket, ssl, urllib) — 0 зависимостей

## Развёртывание

```bash
# Клонировать
git clone https://github.com/by-sonic/BlockPulse.git
cd BlockPulse

# Настроить
cp .env.example .env
# Отредактировать .env — указать BOT_TOKEN, TARGET_IP, HMAC_SECRET

# Запустить
docker compose up -d

# Фронтенд (для разработки)
cd webapp
npm install
npm run dev
```

### Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BP_BOT_TOKEN` | Telegram Bot API token |
| `BP_API_PORT` | Порт API (default: 8080) |
| `BP_API_HOST` | Хост/домен API |
| `BP_TARGET_IP` | IP тестового VPN-сервера |
| `BP_HMAC_SECRET` | Секрет для подписи проб |
| `BP_ADMIN_IDS` | Telegram user IDs администраторов |
| `BP_TG_API_URL` | Прокси для Telegram API (опционально) |

## API

| Endpoint | Описание |
|----------|----------|
| `GET /api/pulse?hours=N` | Сводка по регионам и протоколам |
| `GET /api/pulse/{region}?hours=N` | Детализация по региону |
| `GET /api/pulse/timeline?hours=N&interval=M` | Временной ряд |
| `GET /api/stats` | Общая статистика |
| `GET /api/regions` | Список регионов |
| `GET /api/whoami` | GeoIP текущего IP |
| `POST /api/probe` | Отправка результатов probe |
| `GET /probe.py` | Скачать probe-скрипт |

## Лицензия

MIT
