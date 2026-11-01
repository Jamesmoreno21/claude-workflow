#!/usr/bin/env bash
# Cuts a release: bumps every package to the same version, dates the
# changelog's Unreleased section, runs the checks, commits and tags.
# Usage: npm run release -- patch|minor|major|X.Y.Z
# Pushing is left to you: git push --follow-tags
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUMP="${1:-}"
if [ -z "$BUMP" ]; then
  echo "Usage: npm run release -- patch|minor|major|X.Y.Z" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi
if ! grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  echo "CHANGELOG.md needs an '## [Unreleased]' section." >&2
  exit 1
fi

CURRENT=$(node -p 'require("./package.json").version')
NEXT=$(node -e '
  const [major, minor, patch] = process.argv[1].split(".").map(Number);
  const bump = process.argv[2];
  const next = { major: [major + 1, 0, 0], minor: [major, minor + 1, 0], patch: [major, minor, patch + 1] }[bump];
  if (next) console.log(next.join("."));
  else if (/^\d+\.\d+\.\d+$/.test(bump)) console.log(bump);
  else process.exit(1);
' "$CURRENT" "$BUMP") || { echo "Invalid version or bump: $BUMP" >&2; exit 1; }

if git rev-parse "v$NEXT" >/dev/null 2>&1; then
  echo "Tag v$NEXT already exists." >&2
  exit 1
fi

echo "→ Releasing $CURRENT → $NEXT"
for pkg in package.json server/package.json web/package.json; do
  node -e '
    const fs = require("fs");
    const [file, version] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$pkg" "$NEXT"
done
npm install --package-lock-only --silent

# "## [Unreleased]" keeps its place; the released notes move under the new version.
node -e '
  const fs = require("fs");
  const [next, previous, date] = process.argv.slice(1);
  const repo = "https://github.com/Jamesmoreno21/claude-workflow";
  let log = fs.readFileSync("CHANGELOG.md", "utf8");
  log = log.replace("## [Unreleased]", `## [Unreleased]\n\n## [${next}] - ${date}`);
  log = log.replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${repo}/compare/v${next}...HEAD\n[${next}]: ${repo}/compare/v${previous}...v${next}`);
  fs.writeFileSync("CHANGELOG.md", log);
' "$NEXT" "$CURRENT" "$(date +%Y-%m-%d)"

echo "→ Running checks"
npm run lint --silent
npm run typecheck --silent
npm test --silent

git add package.json server/package.json web/package.json package-lock.json CHANGELOG.md
git commit -qm "chore(release): v$NEXT"
git tag -a "v$NEXT" -m "v$NEXT"
echo "✓ Tagged v$NEXT. Review, then publish with: git push --follow-tags"
