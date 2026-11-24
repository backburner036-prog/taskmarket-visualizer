#!/bin/sh
# One-command deploy: create the public repo (if needed), push, enable Pages.
set -e
cd "$(dirname "$0")"
python3 scripts/fetch.py
gh repo create backburner036-prog/taskmarket-visualizer --public \
  --description "Live Taskmarket market visualizer (Tempo + Base) — data from api.taskmarket.dev, refreshed hourly" \
  2>/dev/null || true
git add -A
git commit -m "deploy: taskmarket visualizer" 2>/dev/null || true
git branch -M main
git remote add origin https://github.com/backburner036-prog/taskmarket-visualizer.git 2>/dev/null || true
git push -u origin main
gh api repos/backburner036-prog/taskmarket-visualizer/pages -X POST \
  -f build_type=workflow 2>/dev/null || echo "Pages already enabled (or enable it in repo Settings > Pages, source: GitHub Actions)."
echo "Live URL: https://backburner036-prog.github.io/taskmarket-visualizer/"
