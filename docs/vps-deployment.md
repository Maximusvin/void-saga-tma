# VPS deployment: `game.riy.contact`

Void Saga розгортається окремим Docker Compose-проєктом на спільному VPS. Стек не публікує host-порти й не запускає власний Caddy/Nginx на `80/443`: HTTPS завершує наявний `coolify-proxy` (`Traefik`), а контейнери підключаються лише до external network `coolify`.

## Межі ізоляції

- VPS root: `/srv/void-saga`.
- Repo checkout: `/srv/void-saga/repo`.
- Server-only env: `/srv/void-saga/env/.env.production` з mode `600`.
- Compose project: `void_saga_prod`.
- Named volume: `void_saga_prod_game_data`.
- Public origin: `https://game.riy.contact`.
- `/api/*` маршрутизується в `api:8787`; решта — у `web:8080`.
- `crm.riy.contact`, `r2b.riy.contact`, root `riy.contact`, чужі контейнери, volumes і proxy-конфіг не змінюються.

## Секрети

`TELEGRAM_BOT_TOKEN` існує тільки у `/srv/void-saga/env/.env.production` або в runtime environment контейнера. Його не можна комітити, друкувати в логах чи зберігати в локальному `.env`.

## Перевірка конфігурації

```bash
npm run prod:compose:check
npm ci
npm run lint
npm run test:server
npm run build
```

У rendered compose не повинно бути `ports`, другого reverse proxy або мережі, відмінної від узгодженого `VOID_SAGA_PROXY_NETWORK`.

## Перший запуск

На VPS:

```bash
mkdir -p /srv/void-saga/{repo,env}
chmod 700 /srv/void-saga/env

cd /srv/void-saga/repo
docker compose \
  --env-file /srv/void-saga/env/.env.production \
  -f docker-compose.prod.yml \
  up -d --build
```

Після запуску обидва контейнери мають бути healthy. DNS-запис Cloudflare:

```text
Type: A
Name: game
Content: 187.77.78.180
Proxy status: Proxied
TTL: Auto
```

## Smoke

```bash
curl -fsS https://game.riy.contact/api/health
curl -I https://game.riy.contact/
curl -i https://game.riy.contact/api/game/state
```

Очікування:

- `/api/health` повертає `200` і `{ "ok": true }`;
- `/` повертає frontend;
- game endpoint без `x-telegram-init-data` повертає `401`, а не frontend HTML;
- після запуску через Telegram запити отримують валідний signed `initData`, а стан зберігається у SQLite volume.

## Rollback

Безпечний app rollback не видаляє volume:

```bash
docker compose \
  --env-file /srv/void-saga/env/.env.production \
  -f docker-compose.prod.yml \
  stop api web
```

Не виконувати `docker compose down -v`: ця команда видалить gameplay state.
