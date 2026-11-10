#!/usr/bin/env python3
"""Write a WakaTime coding-activity snapshot for the site.

    WAKATIME_OAUTH_TOKEN=... python3 scripts/wakatime_stats.py --json public/data/wakatime.json

Reads the per-day summaries for the last N complete days (default 7, ending
yesterday in Hong Kong time) and writes one JSON file: totals, hours per
category (coding / debugging / learning / ...), project, language and editor,
and one row per day. The weekly digest (scripts/weekly_digest.py) uses the
same functions for a Monday-Sunday week.

Auth: since 2026-11-01 WakaTime API keys are write-only (plugins). Reads need
a personal OAuth token from https://wakatime.com/oauth, passed in
WAKATIME_OAUTH_TOKEN. Without it the script prints why and leaves the existing
file alone (exit 0 with --soft, else 2), so the deploy keeps the committed
snapshot instead of publishing empty numbers.

Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

API = "https://api.wakatime.com/api/v1"
TZ_NAME = "Asia/Hong_Kong"
TZ = ZoneInfo(TZ_NAME)
TOP = 12  # rows kept per breakdown; the rest is folded into "Other"


class WakaError(RuntimeError):
    pass


def token_from_env() -> str | None:
    tok = os.environ.get("WAKATIME_OAUTH_TOKEN") or os.environ.get("WAKATIME_TOKEN")
    return tok.strip() if tok and tok.strip() else None


def _get(path: str, params: dict, token: str) -> dict:
    """GET with the OAuth token as a Bearer header; WakaTime also accepts the
    token in place of the api_key query parameter, so fall back to that once."""
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    attempts = [
        (url, {"Authorization": f"Bearer {token}"}),
        (f"{url}&{urllib.parse.urlencode({'api_key': token})}", {}),
    ]
    last = ""
    for target, headers in attempts:
        req = urllib.request.Request(target, headers={"User-Agent": "nurasik14-portfolio", **headers})
        for _ in range(4):  # 202 = stats still being computed
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    if r.status == 202:
                        time.sleep(5)
                        continue
                    return json.load(r)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:300]
                last = f"HTTP {e.code}: {body}"
                if e.code in (401, 403):
                    break  # try the other auth form
                if e.code == 429:
                    time.sleep(10)
                    continue
                raise WakaError(last) from e
            except urllib.error.URLError as e:
                raise WakaError(f"network error: {e.reason}") from e
        else:
            raise WakaError("WakaTime kept answering 202 (stats not ready)")
    raise WakaError(last or "authentication failed")


def fetch_days(token: str, start: date, end: date) -> list[dict]:
    """Raw per-day summaries, start..end inclusive, in Hong Kong time."""
    d = _get(
        "/users/current/summaries",
        {"start": start.isoformat(), "end": end.isoformat(), "timezone": TZ_NAME},
        token,
    )
    days = d.get("data")
    if not isinstance(days, list):
        raise WakaError(f"unexpected summaries payload: {str(d)[:200]}")
    return days


def _rows(totals: dict[str, float], grand: float, top: int = TOP) -> list[dict]:
    # WakaTime has its own "Other" language; merge it with the folded tail.
    items = sorted(((k, v) for k, v in totals.items() if v >= 30 and k != "Other"), key=lambda kv: -kv[1])
    rows, other = items[:top], sum(v for _, v in items[top:]) + totals.get("Other", 0.0)
    if other >= 30:
        rows.append(("Other", other))
    return [
        {"name": k, "seconds": round(v), "percent": round(100 * v / grand, 1) if grand else 0.0}
        for k, v in rows
    ]


def aggregate(days: list[dict], start: date, end: date) -> dict:
    """Fold per-day summaries into one snapshot (the JSON the site reads)."""
    keys = ("categories", "projects", "languages", "editors")
    sums: dict[str, dict[str, float]] = {k: {} for k in keys}
    by_date: dict[str, dict] = {}
    for day in days:
        ds = (day.get("range") or {}).get("date") or (day.get("range") or {}).get("start", "")[:10]
        secs = float((day.get("grand_total") or {}).get("total_seconds") or 0)
        cats = {}
        for k in keys:
            for item in day.get(k) or []:
                name = item.get("name") or "Unknown"
                s = float(item.get("total_seconds") or 0)
                sums[k][name] = sums[k].get(name, 0.0) + s
                if k == "categories" and s >= 1:
                    cats[name] = round(s)
        by_date[ds] = {"date": ds, "seconds": round(secs), "categories": cats}

    n = (end - start).days + 1
    rows = []
    for i in range(n):
        ds = (start + timedelta(days=i)).isoformat()
        rows.append(by_date.get(ds, {"date": ds, "seconds": 0, "categories": {}}))
    total = sum(r["seconds"] for r in rows)
    active = sum(1 for r in rows if r["seconds"] > 0)
    return {
        "source": "wakatime",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "timezone": TZ_NAME,
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": n},
        "total_seconds": total,
        "daily_average_seconds": round(total / n) if n else 0,
        "active_days": active,
        "categories": _rows(sums["categories"], total),
        "projects": _rows(sums["projects"], total),
        "languages": _rows(sums["languages"], total),
        "editors": _rows(sums["editors"], total, top=5),
        "days": rows,
    }


def snapshot(token: str, start: date, end: date) -> dict:
    return aggregate(fetch_days(token, start, end), start, end)


def last_complete_days(n: int, today: date | None = None) -> tuple[date, date]:
    today = today or datetime.now(TZ).date()
    end = today - timedelta(days=1)
    return end - timedelta(days=n - 1), end


def hm(seconds: float) -> str:
    m = round(seconds / 60)
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def main() -> int:
    ap = argparse.ArgumentParser(description="Write a WakaTime coding-activity snapshot for the site.")
    ap.add_argument("--json", default="public/data/wakatime.json", help="output file")
    ap.add_argument("--days", type=int, default=7, help="complete days ending yesterday (HKT)")
    ap.add_argument("--soft", action="store_true", help="exit 0 when the token is missing or the API fails")
    args = ap.parse_args()

    fail = 0 if args.soft else 2
    token = token_from_env()
    if not token:
        print("wakatime: WAKATIME_OAUTH_TOKEN is not set; keeping the existing snapshot", file=sys.stderr)
        return fail
    start, end = last_complete_days(args.days)
    try:
        data = snapshot(token, start, end)
    except WakaError as e:
        print(f"wakatime: {e}; keeping the existing snapshot", file=sys.stderr)
        return fail

    out = Path(args.json)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    cats = ", ".join(f"{c['name']} {hm(c['seconds'])}" for c in data["categories"][:4])
    print(f"wakatime: {start}..{end} {hm(data['total_seconds'])} ({cats}) -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
