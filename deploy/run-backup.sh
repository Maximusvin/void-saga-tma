#!/bin/sh
set -eu

docker_bin="${DOCKER_BIN:-docker}"
compose_project="${VOID_SAGA_COMPOSE_PROJECT:-void_saga_prod}"
repo_dir="${VOID_SAGA_REPO_DIR:-/srv/void-saga/repo}"
env_file="${VOID_SAGA_ENV_FILE:-/srv/void-saga/env/.env.production}"

api_ids=$("$docker_bin" ps \
  --filter "label=com.docker.compose.project=$compose_project" \
  --filter "label=com.docker.compose.service=api" \
  --format '{{.ID}}')

# Container ids contain no whitespace, so positional parameters are a safe count check.
set -- $api_ids
if [ "$#" -ne 1 ]; then
  echo "Expected exactly one running $compose_project API container, found $#" >&2
  exit 1
fi

api_image=$("$docker_bin" inspect --format '{{.Config.Image}}' "$1")
case "$api_image" in
  ""|*:latest)
    echo "Refusing backup with an empty or latest API image: $api_image" >&2
    exit 1
    ;;
esac

"$docker_bin" image inspect "$api_image" >/dev/null

echo "Starting Void Saga backup with deployed image $api_image"
cd "$repo_dir"
VOID_SAGA_BACKUP_IMAGE="$api_image" exec "$docker_bin" compose \
  --env-file "$env_file" \
  -f docker-compose.prod.yml \
  -f docker-compose.backup.yml \
  --profile backup \
  run --rm --no-deps --pull never backup
