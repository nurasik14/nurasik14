#!/usr/bin/env python3
"""Build the weekly digest that the site shows under `## weekly`.

    python3 scripts/weekly_digest.py                 # this week (Mon..today, HKT)
    python3 scripts/weekly_digest.py --week 2026-W45 # a past ISO week
    python3 scripts/weekly_digest.py --dry-run       # print, write nothing

One digest per ISO week, from three real sources:

    WakaTime  hours per project, language and category (coding, debugging,
              learning, ...), via scripts/wakatime_stats.py. Needs
              WAKATIME_OAUTH_TOKEN (https://wakatime.com/oauth).
    git       commits authored by me in the local repos under $HOME, minus
              app-data repos (DIGEST_ROOTS, DIGEST_AUTHORS, DIGEST_EXCLUDE).
    Last.fm   the week's most played tracks, counted from scrobbles
              (LASTFM_API_KEY, LASTFM_USERNAME).

Writes public/data/weekly/<YYYY-Www>.json, updates public/data/weekly/index.json
and refreshes public/data/wakatime.json (last 7 complete days). A source that
fails is recorded as {"error": "..."} so the page shows an honest empty state;
nothing is estimated. The short text digest goes to stdout.

Run weekly by the Hermes cron job "weekly-digest" (~/.hermes/scripts/weekly_digest.sh),
which commits the files and pushes, so the Pages deploy publishes them.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wakatime_stats as waka  # noqa: E402

TZ = waka.TZ
REPO = Path(__file__).resolve().parent.parent
HOME = Path.home()
DEFAULT_ROOTS = [HOME]
SKIP_DIR = re.compile(r"(^\.|node_modules|backup|^dist$|^build$|^venv$|^\.venv$)", re.I)
DEFAULT_AUTHORS = ["nurasik14", "nurasik12", "nserikov2-c@my.cityu.edu.hk", "nurasylserikov4@gmail.com"]
# Repos whose commits are app-written data, not code (quest-journal syncs its
# journal to quest-data). Matched against the repo name; DIGEST_EXCLUDE overrides.
DEFAULT_EXCLUDE = ["quest-data"]


# ---- week maths -----------------------------------------------------------

def week_bounds(spec: str | None, now: datetime) -> tuple[str, date, date, datetime, datetime]:
    """(label, first day, last day, start instant, end instant). The current
    week ends now; a past week ends Sunday 24:00 HKT."""
    if spec:
        m = re.fullmatch(r"(\d{4})-W(\d{2})", spec)
        if not m:
            raise SystemExit(f"--week must look like 2026-W45, got {spec!r}")
        monday = date.fromisocalendar(int(m[1]), int(m[2]), 1)
    else:
        today = now.date()
        monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    start = datetime.combine(monday, time.min, TZ)
    end = min(datetime.combine(sunday + timedelta(days=1), time.min, TZ), now)
    last_day = min(sunday, (end - timedelta(seconds=1)).date())
    y, w, _ = monday.isocalendar()
    return f"{y}-W{w:02d}", monday, last_day, start, end


# ---- git ------------------------------------------------------------------

def find_repos(roots: list[Path], depth: int = 4) -> list[Path]:
    found: list[Path] = []

    def walk(d: Path, level: int) -> None:
        if (d / ".git").exists():
            found.append(d)
            return  # don't descend into a repo's own tree
        if level >= depth:
            return
        try:
            kids = sorted(p for p in d.iterdir() if p.is_dir() and not p.is_symlink())
        except OSError:
            return
        for k in kids:
            if not SKIP_DIR.search(k.name):
                walk(k, level + 1)

    for r in roots:
        walk(r.expanduser(), 0)
    return found


def repo_name(path: Path) -> str:
    try:
        url = subprocess.run(
            ["git", "-C", str(path), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        url = ""
    if url:
        return re.sub(r"\.git$", "", url.rstrip("/").rsplit("/", 1)[-1].rsplit(":", 1)[-1])
    return path.name


def git_commits(start: datetime, end: datetime, roots: list[Path], authors: list[str],
                exclude: list[str] = DEFAULT_EXCLUDE) -> dict:
    seen: set[str] = set()
    repos: dict[str, dict] = {}
    for path in find_repos(roots):
        name = repo_name(path)
        if name in exclude or path.name in exclude:
            continue
        cmd = ["git", "-C", str(path), "log", "--all", "--no-merges",
               f"--since={start.isoformat()}", f"--until={end.isoformat()}",
               "--format=%H%x1f%aI%x1f%s"]
        cmd += [f"--author={a}" for a in authors]
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        for line in out.splitlines():
            sha, when, subject = (line.split("\x1f") + ["", ""])[:3]
            if not sha or sha in seen:
                continue
            seen.add(sha)
            r = repos.setdefault(name, {"name": name, "commits": 0, "days": set(), "subjects": []})
            r["commits"] += 1
            r["days"].add(datetime.fromisoformat(when).astimezone(TZ).date().isoformat())
            r["subjects"].append((when, subject.strip()[:100]))
    rows = []
    for r in sorted(repos.values(), key=lambda r: (-r["commits"], r["name"])):
        subjects = [s for _, s in sorted(r["subjects"], reverse=True)][:5]
        rows.append({"name": r["name"], "commits": r["commits"], "active_days": len(r["days"]), "latest": subjects})
    per_day = Counter()
    for r in repos.values():
        for when, _ in r["subjects"]:
            per_day[datetime.fromisoformat(when).astimezone(TZ).date().isoformat()] += 1
    return {"total": len(seen), "repos": rows, "per_day": dict(sorted(per_day.items()))}


# ---- Last.fm --------------------------------------------------------------

def lastfm_top_tracks(start: datetime, end: datetime, n: int = 5) -> dict:
    key, user = os.environ.get("LASTFM_API_KEY"), os.environ.get("LASTFM_USERNAME")
    if not key or not user:
        raise RuntimeError("LASTFM_API_KEY / LASTFM_USERNAME not set")
    plays: Counter = Counter()
    meta: dict[tuple[str, str], str] = {}
    page, pages = 1, 1
    while page <= pages and page <= 20:
        q = urllib.parse.urlencode({
            "method": "user.getrecenttracks", "user": user, "api_key": key, "format": "json",
            "limit": 200, "page": page, "from": int(start.timestamp()), "to": int(end.timestamp()),
        })
        req = urllib.request.Request(f"https://ws.audioscrobbler.com/2.0/?{q}", headers={"User-Agent": "nurasik14-portfolio"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        if "error" in d:
            raise RuntimeError(f"Last.fm error {d['error']}: {d.get('message')}")
        rt = d.get("recenttracks", {})
        pages = int(rt.get("@attr", {}).get("totalPages") or 1)
        tracks = rt.get("track") or []
        if isinstance(tracks, dict):
            tracks = [tracks]
        for t in tracks:
            if (t.get("@attr") or {}).get("nowplaying"):
                continue  # not scrobbled yet
            k = (t.get("name", ""), (t.get("artist") or {}).get("#text", ""))
            plays[k] += 1
            meta.setdefault(k, t.get("url", ""))
        page += 1
    top = [
        {"name": name, "artist": artist, "plays": c, "url": meta[(name, artist)]}
        for (name, artist), c in sorted(plays.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    ]
    return {"user": user, "scrobbles": sum(plays.values()), "tracks": top}


# ---- digest ---------------------------------------------------------------

def _try(fn, *a):
    try:
        return fn(*a)
    except Exception as e:  # recorded, shown on the page as an empty state
        return {"error": f"{type(e).__name__}: {e}"[:300]}


def highlights(d: dict) -> list[str]:
    out = []
    w = d["wakatime"]
    if "error" not in w and w.get("total_seconds"):
        line = f"{waka.hm(w['total_seconds'])} in the editor over {w['active_days']} days"
        if w["projects"]:
            p = w["projects"][0]
            line += f"; most on {p['name']} ({waka.hm(p['seconds'])})"
        out.append(line + ".")
        cats = [c for c in w["categories"] if c["name"] != "Other"][:3]
        if cats:
            out.append(" / ".join(f"{c['name']} {c['percent']:.0f}%" for c in cats) + ".")
        if w["languages"]:
            out.append("Languages: " + ", ".join(lang["name"] for lang in w["languages"][:3]) + ".")
    elif "error" not in w:
        out.append("No editor time logged this week.")
    g = d["git"]
    if "error" not in g:
        if g["total"]:
            r = g["repos"][0]
            out.append(f"{g['total']} commits in {len(g['repos'])} repos; busiest: {r['name']} ({r['commits']}).")
        else:
            out.append("No commits this week.")
    m = d["lastfm"]
    if "error" not in m and m["tracks"]:
        t = m["tracks"][0]
        out.append(f"On repeat: {t['name']} by {t['artist']} ({t['plays']} plays of {m['scrobbles']} scrobbles).")
    return out


def build(spec: str | None, roots: list[Path], authors: list[str], exclude: list[str]) -> dict:
    now = datetime.now(TZ)
    label, first, last, start, end = week_bounds(spec, now)
    token = waka.token_from_env()
    if token:
        wk = _try(waka.snapshot, token, first, last)
    else:
        wk = {"error": "WAKATIME_OAUTH_TOKEN not set"}
    d = {
        "week": label,
        "start": first.isoformat(),
        "end": last.isoformat(),
        "complete": end >= datetime.combine(first + timedelta(days=7), time.min, TZ),
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "timezone": waka.TZ_NAME,
        "wakatime": wk,
        "git": _try(git_commits, start, end, roots, authors, exclude),
        "lastfm": _try(lastfm_top_tracks, start, end),
    }
    if "error" not in wk:
        for k in ("source", "generated", "timezone", "range"):
            wk.pop(k, None)
    d["highlights"] = highlights(d)
    return d


def index_row(d: dict) -> dict:
    w, g, m = d["wakatime"], d["git"], d["lastfm"]
    top = m["tracks"][0] if "error" not in m and m["tracks"] else None
    return {
        "week": d["week"], "start": d["start"], "end": d["end"], "complete": d["complete"],
        "file": f"data/weekly/{d['week']}.json",
        "coding_seconds": None if "error" in w else w["total_seconds"],
        "commits": None if "error" in g else g["total"],
        "top_track": f"{top['name']} by {top['artist']}" if top else None,
    }


def write(d: dict, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    f = out_dir / f"{d['week']}.json"
    f.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    idx_f = out_dir / "index.json"
    try:
        idx = json.loads(idx_f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        idx = {"weeks": []}
    weeks = [w for w in idx.get("weeks", []) if w.get("week") != d["week"]] + [index_row(d)]
    idx = {"generated": d["generated"], "weeks": sorted(weeks, key=lambda w: w["week"], reverse=True)}
    idx_f.write_text(json.dumps(idx, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return [f, idx_f]


def text(d: dict) -> str:
    lines = [f"Weekly digest {d['week']} ({d['start']} to {d['end']})", ""]
    lines += [f"- {h}" for h in d["highlights"]] or ["- nothing recorded"]
    for src in ("wakatime", "git", "lastfm"):
        if "error" in d[src]:
            lines.append(f"! {src}: {d[src]['error']}")
    w = d["wakatime"]
    if "error" not in w and w["projects"]:
        lines += ["", "Projects: " + ", ".join(f"{p['name']} {waka.hm(p['seconds'])}" for p in w["projects"][:6])]
    m = d["lastfm"]
    if "error" not in m and m["tracks"]:
        lines += ["", "Top tracks:"] + [f"  {i}. {t['name']} - {t['artist']} ({t['plays']})" for i, t in enumerate(m["tracks"], 1)]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the weekly digest (WakaTime, git, Last.fm).")
    ap.add_argument("--week", help="ISO week like 2026-W45 (default: the current week)")
    ap.add_argument("--out", default=str(REPO / "public/data/weekly"), help="digest directory")
    ap.add_argument("--wakatime-json", default=str(REPO / "public/data/wakatime.json"),
                    help="also refresh this last-7-days snapshot ('' to skip)")
    ap.add_argument("--dry-run", action="store_true", help="print the digest JSON, write nothing")
    args = ap.parse_args()

    roots = [Path(p) for p in os.environ.get("DIGEST_ROOTS", "").split(":") if p] or DEFAULT_ROOTS
    authors = [a for a in os.environ.get("DIGEST_AUTHORS", "").split(",") if a] or DEFAULT_AUTHORS
    exclude = [x for x in os.environ.get("DIGEST_EXCLUDE", ",".join(DEFAULT_EXCLUDE)).split(",") if x]
    d = build(args.week, roots, authors, exclude)
    if args.dry_run:
        print(json.dumps(d, indent=2, ensure_ascii=False))
        return 0
    write(d, Path(args.out))
    token = waka.token_from_env()
    if args.wakatime_json and token:
        s, e = waka.last_complete_days(7)
        snap = _try(waka.snapshot, token, s, e)
        if "error" not in snap:
            Path(args.wakatime_json).write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(text(d))
    return 0


if __name__ == "__main__":
    sys.exit(main())
