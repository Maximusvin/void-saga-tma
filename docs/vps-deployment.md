# VPS deployment: `game.riy.contact`

Void Saga розгортається окремим Docker Compose-проєктом на спільному VPS. Стек не публікує host-порти й не запускає власний Caddy/Nginx на `80/443`: HTTPS завершує наявний `coolify-proxy` (`Traefik`), а контейнери підключаються лише до external network `coolify`.

## Межі ізоляції

- VPS root: `/srv/void-saga`.
- Repo checkout: `/srv/void-saga/repo`.
- Server-only env: `/srv/void-saga/env/.env.production` з mode `600`.
- Compose project: `void_saga_prod`.
- Named volume: `void_saga_prod_game_data`.
- Backup directory: `/srv/void-saga/backups`.
- Public origin: `https://game.riy.contact`.
- `/api/*` маршрутизується в `api:8787`; решта — у `web:8080`.
- `crm.riy.contact`, `r2b.riy.contact`, root `riy.contact`, чужі контейнери, volumes і proxy-конфіг не змінюються.

## Секрети

`TELEGRAM_BOT_TOKEN` існує тільки у `/srv/void-saga/env/.env.production` або в runtime environment контейнера. Його не можна комітити, друкувати в логах чи зберігати в локальному `.env`.

## Production Telegram bot

- Display name: `Void Saga: Riftborn`.
- Username: [`@VoidSagaRiftBot`](https://t.me/VoidSagaRiftBot).
- Default chat menu button: `Play` → `https://game.riy.contact/`.
- Commands: `/start` (`Enter the Void`) і `/play` (`Launch Void Saga`).

Профіль і Web App-кнопка налаштовуються через Telegram Bot API лише з VPS: скрипт або операторська команда читає `TELEGRAM_BOT_TOKEN` із server-only env та не виводить його. Після зміни токена потрібно відтворити тільки `api`-контейнер і повторити signed `initData` smoke; frontend та Cloudflare Tunnel перезапуску не потребують.

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
mkdir -p /srv/void-saga/{repo,env,backups}
chmod 700 /srv/void-saga/env
chown 1000:1000 /srv/void-saga/backups
chmod 700 /srv/void-saga/backups

cd /srv/void-saga/repo
docker compose \
  --env-file /srv/void-saga/env/.env.production \
  -f docker-compose.prod.yml \
  up -d --build
```

Після запуску обидва контейнери мають бути healthy. На цьому VPS public ingress працює через named Cloudflare Tunnel `riy-vps`, а не через direct A-record. У `/etc/cloudflared/config.yml` перед catch-all `http_status:404` має бути окреме правило:

```yaml
- hostname: game.riy.contact
  service: https://localhost:443
  originRequest:
    originServerName: game.riy.contact
    noTLSVerify: true
```

Після backup і `cloudflared tunnel --config <candidate> ingress validate` DNS route створюється через наявний server-side Cloudflare credential:

```bash
cloudflared tunnel route dns --overwrite-dns \
  <riy-vps-tunnel-id> \
  game.riy.contact
```

Очікуваний Cloudflare record: `game.riy.contact | Tunnel | riy-vps | Proxied | Auto`. Не створювати direct A-record: на поточному ingress він повертає Cloudflare `522`.

## Backup

Перед увімкненням таймера створити й перевірити перший consistent SQLite backup:

```bash
docker compose \
  --env-file /srv/void-saga/env/.env.production \
  -f docker-compose.prod.yml \
  --profile backup run --rm backup
```

Backup service не має network access, монтує gameplay volume read-only, виконує SQLite online backup і `PRAGMA quick_check`, після чого лишає останні `VOID_SAGA_BACKUP_RETENTION` копій.

Для щоденного запуску:

```bash
cp deploy/systemd/void-saga-backup.service /etc/systemd/system/
cp deploy/systemd/void-saga-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now void-saga-backup.timer
systemctl list-timers void-saga-backup.timer
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
