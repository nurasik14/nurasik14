#!/usr/bin/env python3
"""
scraper.py — the reference collector that feeds the --dashboards view.

WHAT THIS IS
    A real, runnable scraper that produces `public/data/telemetry.json`,
    which is the exact file the site reads when `live.config.js` has
    `MODE = 'file'`. Swap the `collect_*` bodies for your own logic —
    everything downstream (charts, job table, raw inspector) works
    unchanged as long as you emit the same JSON shape.

WHY IT WORKS THIS WAY
    GitHub Pages serves static files only: no server, no cron, no DB.
    So the pipeline is:
        your scraper (here, or your own code)  ->  writes telemetry.json
        ->  you commit it  ->  Actions rebuilds and redeploys.
    The site never talks to Python; it only reads the committed JSON.

USAGE
    python3 scripts/scraper.py --out public/data/telemetry.json
    python3 scripts/scraper.py --out /tmp/t.json --series-from scrape.log

    Then:
        cp /tmp/t.json public/data/telemetry.json
        git add public/data/telemetry.json && git commit -m "telemetry: refresh"

SCHEMA (all keys required; validated at runtime by src/lib/telemetry.js)
    {
      "meta": {
        "generated_at": "2025-11-18T14:32:55+08:00",
        "run_id": "run_20251118_a3f9c21",
        "host": "cityu-node-01",
        "commit": "a3f9c21",
        "pipeline_version": "1.0.0"
      },
      "jobs": [                     # the fleet table
        {"id":"job-7f21","name":"arxiv_cs_cl_daily",
         "target":"arxiv.org/list/cs.CL/recent","parser":"lxml + trafilatura",
         "cadence":"*/15 * * * *","records":18422,"rate":42.1,
         "status":"OK","code":200}   # status: OK | WARN | ERR
      ],
      "series": [                   # the Grafana-style chart, oldest -> newest
        {"ts":"2025-11-18T14:30:00+08:00",
         "ingested":312,"errors":2,"p50":28.4,"p95":61.2,"queue":37}
      ],
      "logs": ["GET  /feed?limit=500 ... 200 OK   1.18s  1204 rec"],
      "sourceMix": [{"src":"arxiv.org","n":18422,"pct":22.4,"lang":"en"}]
    }
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import socket
import statistics
import subprocess
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

# --- optional: only needed if you enable the live HTTP collectors ------
try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

try:
    import feedparser
except ImportError:  # pragma: no cover
    feedparser = None

USER_AGENT = "nurasik-telemetry/1.0 (+https://github.com/nurasik14)"
TZ = timezone(timedelta(hours=8))  # Asia/Hong_Kong


def git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "local"


def hostname() -> str:
    return socket.gethostname().split(".")[0]


# ====================================================================
# 1. JOB FLEET — replace these with your real collectors
# ====================================================================

def collect_arxiv() -> dict:
    """Counts entries on arxiv's cs.CL recent page.

    This is the one collector that runs for real by default, so you can
    confirm the pipeline end-to-end before swapping in your own sources.
    """
    job = {
        "id": "job-arxiv",
        "name": "arxiv_cs_cl_daily",
        "target": "arxiv.org/list/cs.CL/recent",
        "parser": "stdlib re",
        "cadence": "*/15 * * * *",
        "records": 0,
        "rate": 0.0,
        "status": "OK",
        "code": 0,
    }
    if requests is None:
        job.update(status="WARN", code=0)
        return job
    try:
        r = requests.get(
            "https://arxiv.org/list/cs.CL/recent",
            headers={"User-Agent": USER_AGENT},
            timeout=12,
        )
        job["code"] = r.status_code
        # each entry looks like: arXiv:2511.12345v1 [cs.CL]
        n = len(re.findall(r"arXiv:\d{4}\.\d{4,5}v\d", r.text))
        job["records"] = n
        job["rate"] = round(n / 12.0, 1) if n else 0.0
        # 200 with zero entries means the page shape changed or we were
        # served an interstitial — that is a parser problem, not an outage.
        job["status"] = "OK" if r.ok and n > 0 else ("WARN" if r.ok else "ERR")
    except Exception as exc:  # network down, DNS, timeout...
        job.update(status="ERR", code=0)
        job["parser"] = f"error: {type(exc).__name__}"
    return job


def collect_local_corpus() -> dict:
    """Counts files in your own corpus directory.

    Point CORPUS_DIR at whatever you have scraped before — this makes
    the dashboard reflect your actual local dataset size, which is a
    nice honest touch: the number is real even if the others are not.
    """
    corpus = Path(os.environ.get("CORPUS_DIR", "data/corpus"))
    n = sum(1 for p in corpus.rglob("*") if p.is_file()) if corpus.exists() else 0
    return {
        "id": "job-corpus",
        "name": "local_corpus_index",
        "target": str(corpus),
        "parser": "pathlib rglob",
        "cadence": "manual",
        "records": n,
        "rate": 0.0,
        "status": "OK" if n else "WARN",
        "code": 200 if n else 0,
    }


def collect_jobs() -> list[dict]:
    """Add or remove entries here — the fleet table renders whatever
    this returns, in order."""
    return [collect_arxiv(), collect_local_corpus()]


# ====================================================================
# 2. TIME SERIES — replace with your real measurements
# ====================================================================

def series_from_csv(path: Path) -> list[dict]:
    """Load your own metrics from a CSV.

    Expected header (extra columns are ignored):
        timestamp,ingested,errors,p50,p95,queue
    """
    rows = []
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows.append({
                "ts": row["timestamp"],
                "ingested": int(float(row.get("ingested", 0))),
                "errors": int(float(row.get("errors", 0))),
                "p50": float(row.get("p50", 0) or 0),
                "p95": float(row.get("p95", 0) or 0),
                "queue": int(float(row.get("queue", 0))),
            })
    return rows


def series_synthetic(buckets: int = 288, bucket_min: int = 5) -> list[dict]:
    """Fallback generator — clearly synthetic, used only when you have
    no real measurements yet. Replace before publishing if you care
    about the numbers being true."""
    rnd = random.Random(0xA11CE)
    now = datetime.now(TZ).replace(second=0, microsecond=0)
    out = []
    for i in range(buckets - 1, -1, -1):
        t = now - timedelta(minutes=i * bucket_min)
        hour = t.hour + t.minute / 60
        diurnal = 0.55 + 0.45 * __import__("math").sin(((hour - 4) / 24) * 2 * __import__("math").pi)
        burst = 2.4 if rnd.random() > 0.965 else 1.0
        out.append({
            "ts": t.isoformat(),
            "ingested": int((120 + 190 * diurnal) * (1 + rnd.gauss(0, 0.14)) * burst),
            "errors": max(0, int(rnd.gauss(2.1, 1.8) * burst)),
            "p50": round(28 + rnd.gauss(0, 3.2) + (9 if burst > 1 else 0), 1),
            "p95": round(61 + rnd.gauss(0, 7.4) + (21 if burst > 1 else 0), 1),
            "queue": max(0, int(34 + 48 * diurnal + rnd.gauss(0, 9))),
        })
    return out


# ====================================================================
# 3. LOGS + SOURCE MIX
# ====================================================================

def build_logs(jobs: list[dict]) -> list[str]:
    logs = []
    for j in jobs:
        if j["status"] == "ERR":
            logs.append(f"GET  {j['target']:<38} !! FAIL {j['code']}  {j['parser']}")
        elif j["status"] == "WARN":
            logs.append(f"GET  {j['target']:<38} ?? WARN {j['code']}  {j['parser']}")
        else:
            logs.append(
                f"GET  {j['target']:<38} 200 OK  {j['parser']}  "
                f"{j['records']} rec"
            )
    logs.append(f"duckdb: INSERT INTO pipeline_runs ... {len(jobs)} rows")
    return logs


def build_source_mix(jobs: list[dict]) -> list[dict]:
    total = sum(j["records"] for j in jobs) or 1
    out = []
    for j in jobs:
        parsed = urlparse(j["target"] if "//" in j["target"] else f"//{j['target']}")
        host = parsed.netloc or parsed.path.strip("/") or j["target"]
        out.append({
            "src": host,
            "n": j["records"],
            "pct": round(j["records"] / total * 100, 1),
            "lang": j.get("lang", "en"),
        })
    return out


# ====================================================================
# 4. ASSEMBLE + WRITE
# ====================================================================

def build_payload(series: list[dict], jobs: list[dict]) -> dict:
    p95 = [s["p95"] for s in series] or [0]
    return {
        "meta": {
            "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
            "run_id": f"run_{datetime.now(TZ):%Y%m%d_%H%M%S}_{git_sha()[:7]}",
            "host": hostname(),
            "commit": git_sha(),
            "pipeline_version": "1.0.0",
            "p95_median": round(statistics.median(p95), 1),
        },
        "jobs": jobs,
        "series": series,
        "logs": build_logs(jobs),
        "sourceMix": build_source_mix(jobs),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="emit telemetry.json for the dashboards view")
    ap.add_argument("--out", default="public/data/telemetry.json")
    ap.add_argument("--series-from", help="CSV with timestamp,ingested,errors,p50,p95,queue")
    ap.add_argument("--print", action="store_true", help="also dump to stdout")
    args = ap.parse_args()

    t0 = time.time()
    jobs = collect_jobs()

    if args.series_from:
        series = series_from_csv(Path(args.series_from))
        origin = f"csv:{args.series_from}"
    else:
        series = series_synthetic()
        origin = "synthetic"

    payload = build_payload(series, jobs)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    ok = sum(1 for j in jobs if j["status"] == "OK")
    print(
        f"wrote {out}  ({out.stat().st_size / 1024:.1f} KB)  "
        f"jobs={len(jobs)} ok={ok} series={len(series)} src={origin} "
        f"in {time.time() - t0:.2f}s"
    )
    if args.print:
        print(json.dumps(payload, indent=2)[:2000])


if __name__ == "__main__":
    main()