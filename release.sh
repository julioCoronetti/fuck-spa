#!/usr/bin/env bash
set -euo pipefail

LAST=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
BASE=${LAST#v}
IFS=. read -r MAJOR MINOR PATCH <<<"$BASE"

case "${1:-patch}" in
  major) NEXT="v$((MAJOR + 1)).0.0" ;;
  minor) NEXT="v$MAJOR.$((MINOR + 1)).0" ;;
  patch) NEXT="v$MAJOR.$MINOR.$((PATCH + 1))" ;;
  *) echo "Usage: $0 [patch|minor|major]" >&2; exit 1 ;;
esac

if ! git diff --quiet; then
  echo "Working tree has uncommitted changes. Commit first." >&2
  exit 1
fi

npx --yes esbuild src/opencode/tool.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa.opencode.js --external:@opencode-ai/plugin --external:playwright
npx --yes esbuild src/mcp/server.ts --bundle --platform=node --format=esm --outfile=dist/fuck-spa-mcp.js --external:playwright

if ! git diff --quiet -- dist/; then
  echo "dist/ stale: rebuild changed bundles. Commit the rebuilt dist and run again." >&2
  exit 1
fi

npm version --no-git-tag-version "${NEXT#v}"
git add package.json package-lock.json
git commit -m "Release $NEXT"
git tag -a "$NEXT" -m "Release $NEXT"
git push origin HEAD "$NEXT"
echo "Tag $NEXT pushed."