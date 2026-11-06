#!/usr/bin/env bash
# 一次性：把服务器上的 compose 服务 qmreader / 容器 qiaomu-qmreader 改名为 zlnews。
# 只改名、仍用当前镜像和代码；之后再用 deploy.sh 部署新代码。已改过则直接退出。
# 用法（在 Mac 上）：ssh linux bash -s -- "$(date -u +%Y%m%dT%H%M%SZ)" < ops/news/rename-service.sh
set -euo pipefail
umask 077
RUN=${1:?}
[[ "$RUN" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 2
PROJECT=/home/cosiohzp/apps/zonglan-news
BACKUP="/home/cosiohzp/apps/zonglan-news-backups/$RUN-rename"
cd "$PROJECT"
exec 9> .news-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }

services=$(docker compose config --services)
if [ "$services" = zlnews ]; then echo '[rename] already renamed'; exit 0; fi
[ "$services" = qmreader ] || { echo "Unexpected services: $services"; exit 1; }
CID=$(docker compose ps -q qmreader)
[ -n "$CID" ] && [ "$(docker inspect -f '{{.State.Running}}' "$CID")" = true ]
IMAGE=$(docker inspect -f '{{.Image}}' "$CID")

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 http://127.0.0.1:3088/ >/dev/null &&
       curl -fsS --max-time 3 http://127.0.0.1:3088/api/me |
         python3 -c 'import json,sys; assert (json.load(sys.stdin).get("user") or {}).get("id")=="zonglan-personal"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

RENAMED=0
# 失败时恢复原 compose，用原镜像重新拉起 qmreader。不用 compose down：RSSHub 也挂在这个网络上。
restore() {
  code=$?
  trap - EXIT
  if [ "$code" != 0 ]; then
    echo "[rename] FAILED; restoring qmreader. Backup: $BACKUP"
    if [ "$RENAMED" = 1 ]; then
      docker compose rm -sf zlnews || true
      cp -p "$BACKUP/docker-compose.yml.before" docker-compose.yml
    fi
    if ! docker compose ps -q qmreader | grep -q .; then docker compose up -d --no-build qmreader || true; fi
  fi
  exit "$code"
}
trap restore EXIT

mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
printf '%s\n' "$IMAGE" > "$BACKUP/old-image-id.txt"
cp -p docker-compose.yml "$BACKUP/docker-compose.yml.before"
docker tag "$IMAGE" "zonglan-news-rollback:$RUN-rename"

docker compose stop -t 60 qmreader
tar --exclude=./node_modules --exclude=./.git --exclude=./.news-deploy.lock -czf "$BACKUP/project.tar.gz" .
(cd "$BACKUP"; sha256sum project.tar.gz > project.sha256; sha256sum -c project.sha256)
docker compose rm -f qmreader

RENAMED=1
python3 - <<'PY'
import pathlib
p = pathlib.Path('docker-compose.yml')
text = p.read_text()
for old, new in (('\n  qmreader:\n', '\n  zlnews:\n'), ('container_name: qiaomu-qmreader', 'container_name: zlnews')):
    if text.count(old) != 1:
        raise SystemExit(f'compose layout changed: {old!r}')
    text = text.replace(old, new)
p.write_text(text)
PY
docker compose config --quiet
[ "$(docker compose config --services)" = zlnews ]
TARGET=$(docker compose config --images)
[[ "$TARGET" =~ ^[a-zA-Z0-9._/:-]+$ ]]
docker tag "$IMAGE" "$TARGET"
docker compose up -d --no-build zlnews
healthy
echo "[rename] zlnews is running with the previous image. Backup: $BACKUP"
