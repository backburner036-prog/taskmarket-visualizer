#!/usr/bin/env python3
"""Fetch Taskmarket market data server-side and write static data/data.json.

All numbers come from https://api.taskmarket.dev (public, no key).
Run hourly via GitHub Actions (.github/workflows/fetch.yml) or locally:
    python3 scripts/fetch.py
Amounts from the API are in smallest units (1e6 units = $1 / 1 OUSD / 1 USDC).
"""
import json, os, subprocess, sys, time
from collections import Counter, defaultdict
from datetime import datetime, timezone

BASE = "https://api.taskmarket.dev"
CHAINS = {"4217": {"name": "Tempo", "currency": "OUSD"},
          "8453": {"name": "Base", "currency": "USDC"}}
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "data.json")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(path):
    """Fetch via curl (urllib hits RemoteDisconnected/IncompleteRead on this API)."""
    url = BASE + path
    last = None
    for attempt in range(4):
        try:
            out = subprocess.run(
                ["curl", "-sS", "--max-time", "60", "-A", "taskmarket-visualizer/1.0", url],
                capture_output=True, text=True, timeout=90, check=True)
            return json.loads(out.stdout)
        except Exception as e:
            last = e
            print(f"retry {attempt + 1}/4 {path}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)
    raise last


def to_usd(v):
    try:
        return int(v) / 1_000_000
    except (TypeError, ValueError):
        return 0


def week_key(iso):
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def main():
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    data = {"fetchedAt": fetched_at, "source": BASE, "chains": {}, "combined": {}}
    all_tasks = {}  # id -> task (deduped across chains)

    for cid, meta in CHAINS.items():
        c = {"name": meta["name"], "currency": meta["currency"], "chainId": int(cid)}
        c["marketStats"] = get(f"/api/market/stats?chainId={cid}")
        c["breakdowns"] = get(f"/api/stats/breakdowns?chainId={cid}")
        c["timeSeries"] = {}
        for rng, bucket in [("7d", "day"), ("30d", "day"), ("90d", "day"), ("all", "week")]:
            c["timeSeries"][rng] = get(
                f"/api/stats/platform-time-series?chainId={cid}&range={rng}&bucket={bucket}")
        c["heatmapHourOfWeek"] = get(
            f"/api/stats/activity-heatmap?chainId={cid}&range=30d&dimension=hourOfWeek")
        c["heatmapMode"] = get(
            f"/api/stats/activity-heatmap?chainId={cid}&range=30d&dimension=mode")
        c["activityFeed"] = get(f"/api/stats/activity-feed?chainId={cid}&limit=50")
        data["chains"][cid] = c

        # Paginate the full task list (for distinct posters per week).
        cursor = None
        n = 0
        while True:
            path = f"/api/tasks?chainId={cid}&sort=newest&limit=100"
            if cursor:
                path += f"&cursor={cursor}"
            page = get(path)
            for t in page.get("tasks", []):
                n += 1
                if t["id"] not in all_tasks:
                    all_tasks[t["id"]] = t
            cursor = page.get("nextCursor")
            if not page.get("hasMore") or not cursor:
                break
        c["tasksFetched"] = n
        print(f"chain {cid}: {n} tasks fetched", file=sys.stderr)

    tasks = list(all_tasks.values())
    print(f"distinct tasks: {len(tasks)}", file=sys.stderr)
    task_dates = [t["createdAt"] for t in tasks if t.get("createdAt")]
    breakdown_total = sum(s["count"] for s in data["chains"]["4217"]["breakdowns"]["status"])

    # --- Distinct posters per week (computed from the task list) ---
    per_week = defaultdict(set)
    poster_counts = Counter()
    for t in tasks:
        per_week[week_key(t["createdAt"])].add(t["requester"])
        poster_counts[t["requester"]] += 1
    posters_weekly = [{"week": w, "distinctPosters": len(s)}
                      for w, s in sorted(per_week.items())][-26:]
    top_posters = [{"requester": a, "tasks": n} for a, n in poster_counts.most_common(10)]
    total_tasks = len(tasks)
    top1_share = (poster_counts.most_common(1)[0][1] / total_tasks) if total_tasks else 0
    top10_share = sum(n for _, n in poster_counts.most_common(10)) / total_tasks if total_tasks else 0
    one_task_posters = sum(1 for n in poster_counts.values() if n == 1)

    # --- Outcomes from the status breakdown (Tempo == Base in the API today) ---
    status = {s["status"]: s["count"] for s in data["chains"]["4217"]["breakdowns"]["status"]}
    mode = {m["mode"]: m["count"] for m in data["chains"]["4217"]["breakdowns"]["mode"]}
    completed = status.get("completed", 0)
    died = status.get("cancelled", 0) + status.get("expired", 0)
    decided = completed + died

    # --- 30-day money flow (Tempo series; API returns the same series per chain) ---
    ts30 = data["chains"]["4217"]["timeSeries"]["30d"]
    put_up_30 = sum(to_usd(b.get("rewardVolume", 0)) for b in ts30)
    paid_30 = sum(to_usd(b.get("paidVolume", 0)) for b in ts30)
    created_30 = sum(b.get("tasksCreated", 0) for b in ts30)
    completed_30 = sum(b.get("completedTasks", 0) for b in ts30)
    settlements_30 = sum(b.get("settlements", 0) for b in ts30)
    active_7d = data["chains"]["4217"]["marketStats"].get("activeAgents7d")

    # --- Busiest hour / weekday from the heatmap ---
    hm = data["chains"]["4217"]["heatmapHourOfWeek"]
    cells = hm.get("cells", [])
    peak = max(cells, key=lambda c: c["count"]) if cells else None
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    by_day = Counter()
    by_hour = Counter()
    for cell in cells:
        by_day[int(cell["row"])] += cell["count"]
        by_hour[int(cell["col"])] += cell["count"]
    busiest_day = days[max(by_day, key=by_day.get)] if by_day else None
    busiest_hour = max(by_hour, key=by_hour.get) if by_hour else None

    # --- Newest open tasks ---
    open_tasks = sorted(
        [t for t in tasks if t.get("status") == "open"],
        key=lambda t: t["createdAt"], reverse=True)[:12]
    newest_open = [{
        "referenceCode": t.get("referenceCode"), "mode": t.get("mode"),
        "rewardUsd": to_usd(t.get("reward", 0)), "createdAt": t.get("createdAt"),
        "requester": t.get("requester"),
        "title": (t.get("description") or "").split("\n")[0][:120],
    } for t in open_tasks]

    data["combined"] = {
        "totalTasks": total_tasks,
        # Minimal task index so every computed poster figure can be reproduced
        # from this file alone (id, requester, createdAt, status, mode, chainId).
        "tasksIndex": [{
            "id": t["id"], "requester": t.get("requester"),
            "createdAt": t.get("createdAt"), "status": t.get("status"),
            "mode": t.get("mode"), "chainId": t.get("chainId"),
        } for t in sorted(tasks, key=lambda t: t.get("createdAt") or "")],
        "tasksReturnedTempo": data["chains"]["4217"]["tasksFetched"],
        "tasksReturnedBase": data["chains"]["8453"]["tasksFetched"],
        "tasksDateMin": min(task_dates) if task_dates else None,
        "tasksDateMax": max(task_dates) if task_dates else None,
        "breakdownTotalTasks": breakdown_total,
        "distinctPosters": len(poster_counts),
        "postersPerWeek": posters_weekly,
        "topPosters": top_posters,
        "top1Share": round(top1_share, 4),
        "top10Share": round(top10_share, 4),
        "oneTaskPosters": one_task_posters,
        "status": status,
        "mode": mode,
        "completed": completed,
        "died": died,
        "decided": decided,
        "diedShareOfDecided": round(died / decided, 4) if decided else 0,
        "putUp30d": round(put_up_30, 2),
        "paid30d": round(paid_30, 2),
        "payoutRatio30d": round(paid_30 / put_up_30, 4) if put_up_30 else 0,
        "created30d": created_30,
        "completed30d": completed_30,
        "settlements30d": settlements_30,
        "activeAgents7d": active_7d,
        "busiestDay": busiest_day,
        "busiestHourUtc": busiest_hour,
        "peakCell": {"day": days[int(peak["row"])], "hourUtc": int(peak["col"]),
                     "count": peak["count"]} if peak else None,
        "newestOpen": newest_open,
    }
    data["endpoints"] = [
        "/api/market/stats?chainId=…",
        "/api/stats/breakdowns?chainId=…",
        "/api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week",
        "/api/stats/activity-heatmap?chainId=…&range=30d&dimension=hourOfWeek|mode",
        "/api/stats/activity-feed?chainId=…&limit=50",
        "/api/tasks?chainId=…&sort=newest&limit=100 (paginated, all tasks)",
    ]
    data["notes"] = (
        "Amounts in smallest units (1e6 = $1). Breakdowns and time series returned by "
        "the API are identical for chainId 4217 and 8453 at fetch time; per-chain "
        "headline numbers that do differ (paidWorkers, activeWallets) are shown per chain. "
        "Distinct posters per week are computed from the tasks returned by the paginated "
        "/api/tasks list, deduplicated by task id across chains "
        f"({total_tasks} distinct tasks, {min(task_dates)[:10]} to {max(task_dates)[:10]}). "
        f"The list endpoint returns fewer tasks than the breakdown total ({breakdown_total}), "
        "so poster figures cover the tasks the list endpoint returns, not every task ever. "
        "No names are attached to addresses."
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f)
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes) fetchedAt={fetched_at}", file=sys.stderr)

    # Share image with live numbers (regenerated every fetch).
    try:
        import make_og
        make_og.build(data)
    except Exception as e:  # share image must never break the data fetch
        print(f"og image skipped: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
