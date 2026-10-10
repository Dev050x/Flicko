#!/usr/bin/env bash
# Runs on the server (called by the deploy job over SSH): fast-forward to the
# pushed commit, install, migrate, restart, and wait for /health.
# Usage: deploy.sh [commit-sha]   (defaults to origin/main)
set -euo pipefail

# Everything is inside main so bash has parsed the whole script before git
# rewrites this file.
main() {
  local sha="${1:-origin/main}"
  local bun="${BUN:-$HOME/.bun/bin/bun}"
  local repo
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

  cd "$repo"
  git fetch --quiet origin main
  git merge --ff-only "$sha"
  echo "deploying $(git log -1 --format='%h %s')"

  cd "$repo/flicko_app"
  "$bun" install --filter @flicko/server --frozen-lockfile

  cd "$repo/flicko_app/apps/server"
  "$bun" run db:migrate
  sudo -n systemctl restart flicko

  local port
  port="$(grep -E '^PORT=' .env | cut -d= -f2 || true)"
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${port:-3000}/health"; then
      echo
      echo "healthy"
      return 0
    fi
    sleep 1
  done

  echo "health check failed" >&2
  journalctl -u flicko -n 50 --no-pager >&2 || true
  return 1
}

main "$@"
exit
