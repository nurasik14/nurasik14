#!/usr/bin/env python3
"""Generate the GitHub profile stat cards used in README.md.

Writes three SVGs styled like the portfolio site (docs/DESIGN.md tokens):

    overview.svg   github.yaml: repos, stars, commits, PRs, issues ...
    languages.svg  share of code by bytes across public, non-fork repos
    activity.svg   contribution grid for the last year + streaks

Everything comes from one GitHub GraphQL query, so the numbers are real.
Standard library only. Needs a token in GITHUB_TOKEN (or GH_TOKEN):

    GITHUB_TOKEN=$(gh auth token) python3 scripts/profile_stats.py --out stats

The profile-stats workflow runs this daily and publishes the result to the
`output` branch, which README.md links to.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import date, timedelta
from html import escape
from pathlib import Path

# ---- design tokens (same hex values as src/index.css) ---------------------
BG = "#111316"
SURFACE = "#191c21"
LINE = "#2c3139"
LINE_SOFT = "#1e2228"
FG = "#e8e3d8"
DIM = "#9ba1a8"
FAINT = "#7a8189"
SIGNAL = "#f0b35a"  # amber
OK = "#93c47d"  # sage
INFO = "#82aed6"  # steel
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

# Markup and notebook outputs inflate byte counts without being "code I wrote".
EXCLUDED_LANGS = {"HTML", "CSS", "SCSS", "Jupyter Notebook"}

# Card sizes. Overview and languages share one size so they line up in a row.
CARD_W, CARD_H = 440, 210
WIDE_W, WIDE_H = 930, 190

QUERY = """
query($login: String!) {
  user(login: $login) {
    login
    createdAt
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(
      first: 1
      contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]
    ) { totalCount }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      privacy: PUBLIC
      isFork: false
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


def fetch(login: str, token: str) -> dict:
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": login}}).encode(),
        headers={
            "Authorization": f"bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "profile-stats",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        payload = json.load(res)
    if payload.get("errors"):
        sys.exit(f"GraphQL error: {payload['errors']}")
    return payload["data"]["user"]


# ---- numbers ---------------------------------------------------------------


def languages(user: dict, top: int = 6) -> list[tuple[str, str, float]]:
    sizes: dict[str, int] = {}
    colors: dict[str, str] = {}
    for repo in user["repositories"]["nodes"]:
        for edge in repo["languages"]["edges"]:
            name = edge["node"]["name"]
            if name in EXCLUDED_LANGS:
                continue
            sizes[name] = sizes.get(name, 0) + edge["size"]
            colors[name] = edge["node"]["color"] or FAINT
    total = sum(sizes.values()) or 1
    ranked = sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)
    out = [(n, colors[n], s / total * 100) for n, s in ranked[:top]]
    rest = sum(s for _, s in ranked[top:])
    if rest:
        out.append(("Other", FAINT, rest / total * 100))
    return out


def calendar_days(user: dict) -> list[tuple[date, int]]:
    weeks = user["contributionsCollection"]["contributionCalendar"]["weeks"]
    return [
        (date.fromisoformat(d["date"]), d["contributionCount"])
        for w in weeks
        for d in w["contributionDays"]
    ]


def streaks(days: list[tuple[date, int]], today: date) -> tuple[int, int]:
    """(current, longest) streak of days with at least one contribution.

    Today does not break the current streak until it is over, so a streak
    that ended yesterday still counts as current.
    """
    counts = {d: c for d, c in days}
    longest = run = 0
    for _, c in days:
        run = run + 1 if c else 0
        longest = max(longest, run)
    current = 0
    cursor = today if counts.get(today) else today - timedelta(days=1)
    while counts.get(cursor):
        current += 1
        cursor -= timedelta(days=1)
    return current, longest


# ---- svg helpers -----------------------------------------------------------


def text(x, y, s, fill=FG, size: float = 13, weight=400, anchor="start", extra=""):
    return (
        f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(str(s))}</text>'
    )


def frame(w: int, h: int, title: str, meta: str, body: str, label: str) -> str:
    """Panel with a tab-like header, like the config.yaml block on the site."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(label)}">
<title>{escape(label)}</title>
<style>text {{ font-family: {MONO}; }}</style>
<clipPath id="card"><rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="6"/></clipPath>
<g clip-path="url(#card)">
<rect width="{w}" height="{h}" fill="{BG}"/>
<rect width="{w}" height="36" fill="{SURFACE}"/>
</g>
<path d="M0 36.5 H{w}" stroke="{LINE}"/>
<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="6" fill="none" stroke="{LINE}"/>
<rect x="16" y="34" width="{len(title) * 7.8 + 4:.0f}" height="2" fill="{SIGNAL}"/>
{text(18, 23, title, FG, 12.5)}
{text(w - 18, 23, meta, FAINT, 11.5, anchor="end")}
{body}
</svg>
"""


def fmt(n: int) -> str:
    return f"{n:,}"


# ---- cards -----------------------------------------------------------------


def overview_card(user: dict) -> str:
    repos = user["repositories"]
    stars = sum(r["stargazerCount"] for r in repos["nodes"])
    cc = user["contributionsCollection"]
    rows = [
        ("public_repos", repos["totalCount"], "# not forks"),
        ("stars_earned", stars, ""),
        ("commits", cc["totalCommitContributions"], "# last 12 months"),
        ("pull_requests", user["pullRequests"]["totalCount"], ""),
        ("issues", user["issues"]["totalCount"], ""),
        ("contributed_to", user["repositoriesContributedTo"]["totalCount"], "# other repos"),
        ("followers", user["followers"]["totalCount"], ""),
    ]
    since = user["createdAt"][:4]
    body = []
    y = 62
    for key, val, note in rows:
        body.append(
            f'<text x="20" y="{y}" font-size="13">'
            f'<tspan fill="{INFO}">{key}</tspan><tspan fill="{FAINT}">:</tspan> '
            f'<tspan fill="{SIGNAL}">{fmt(val)}</tspan></text>'
        )
        if note:
            body.append(text(CARD_W - 20, y, note, FAINT, 11.5, anchor="end"))
        y += 21
    return frame(
        CARD_W, CARD_H, "github.yaml", f"since {since}", "\n".join(body),
        f"GitHub stats for {user['login']}",
    )


def languages_card(user: dict) -> str:
    langs = languages(user)
    body = []
    # stacked bar
    x, bar_w, by = 20.0, CARD_W - 40, 54
    body.append(f'<clipPath id="bar"><rect x="20" y="{by}" width="{bar_w}" height="8" rx="2"/></clipPath>')
    body.append('<g clip-path="url(#bar)">')
    for _, color, pct in langs:
        w = bar_w * pct / 100
        body.append(f'<rect x="{x:.2f}" y="{by}" width="{w + 0.5:.2f}" height="8" fill="{color}"/>')
        x += w
    body.append("</g>")
    # two-column legend
    col_x = (20, CARD_W // 2 + 10)
    for i, (name, color, pct) in enumerate(langs):
        cx = col_x[i % 2]
        cy = 92 + (i // 2) * 26
        body.append(f'<rect x="{cx}" y="{cy - 9}" width="9" height="9" rx="2" fill="{color}"/>')
        body.append(text(cx + 17, cy, name, FG, 12.5))
        body.append(text(cx + CARD_W // 2 - 50, cy, f"{pct:.1f}%", DIM, 12, anchor="end"))
    body.append(text(20, CARD_H - 14, "by bytes · public repos · no forks, html/css/notebooks", FAINT, 10.5))
    return frame(
        CARD_W, CARD_H, "languages.log", "top languages", "\n".join(body),
        f"Most used languages of {user['login']}",
    )


def activity_card(user: dict, today: date) -> str:
    days = calendar_days(user)
    current, longest = streaks(days, today)
    total = user["contributionsCollection"]["contributionCalendar"]["totalContributions"]
    peak = max((c for _, c in days), default=0) or 1
    shades = [LINE_SOFT, "#4a3a20", "#7a5a2a", "#b8853f", SIGNAL]

    cell, gap = 11, 3
    gx, gy = 48, 58
    body = []
    # weekday labels
    for row, label in ((1, "Mon"), (3, "Wed"), (5, "Fri")):
        body.append(text(gx - 8, gy + row * (cell + gap) + 9, label, FAINT, 10, anchor="end"))
    first = days[0][0] if days else today
    offset = (first.weekday() + 1) % 7  # GitHub weeks start on Sunday
    last_month = None
    for i, (d, c) in enumerate(days):
        idx = i + offset
        col, row = idx // 7, idx % 7
        x, y = gx + col * (cell + gap), gy + row * (cell + gap)
        level = 0 if c == 0 else min(4, 1 + int(3 * c / peak))
        stroke = f' stroke="{FG}"' if d == today else ""
        body.append(
            f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" rx="2" fill="{shades[level]}"{stroke}>'
            f"<title>{d.isoformat()}: {c}</title></rect>"
        )
        if row == 0 and d.month != last_month and d.day <= 7:
            body.append(text(x, gy - 8, d.strftime("%b").lower(), FAINT, 10))
            last_month = d.month
    # stats column
    sx = gx + 53 * (cell + gap) + 24
    for j, (val, label, color) in enumerate(
        ((current, "current streak", SIGNAL), (longest, "longest streak", FG), (total, "contributions", FG))
    ):
        y = gy + 18 + j * 42
        body.append(text(sx, y, fmt(val), color, 20, 600))
        body.append(text(sx, y + 15, label, DIM, 11))
    # legend
    lx = gx
    ly = gy + 7 * (cell + gap) + 12
    body.append(text(lx, ly + 9, "less", FAINT, 10))
    for k, shade in enumerate(shades):
        body.append(f'<rect x="{lx + 32 + k * 14}" y="{ly}" width="{cell}" height="{cell}" rx="2" fill="{shade}"/>')
    body.append(text(lx + 32 + 5 * 14 + 4, ly + 9, "more", FAINT, 10))
    return frame(
        WIDE_W, WIDE_H, "contributions.cal", f"last 12 months · updated {today.isoformat()}",
        "\n".join(body), f"Contribution activity of {user['login']}",
    )


def summary(user: dict, today: date) -> dict:
    """Plain data for the portfolio site (public/data/github.json)."""
    days = calendar_days(user)
    current, longest = streaks(days, today)
    repos = user["repositories"]
    cc = user["contributionsCollection"]
    return {
        "login": user["login"],
        "generated": today.isoformat(),
        "since": user["createdAt"][:10],
        "public_repos": repos["totalCount"],
        "stars": sum(r["stargazerCount"] for r in repos["nodes"]),
        "followers": user["followers"]["totalCount"],
        "commits_last_year": cc["totalCommitContributions"],
        "contributions_last_year": cc["contributionCalendar"]["totalContributions"],
        "pull_requests": user["pullRequests"]["totalCount"],
        "streak": {"current": current, "longest": longest},
        "languages": [{"name": n, "color": c, "pct": round(p, 1)} for n, c, p in languages(user)],
        "days": [[d.isoformat(), c] for d, c in days],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate the GitHub profile stat cards.")
    ap.add_argument("--user", default=os.environ.get("GITHUB_REPOSITORY_OWNER", "nurasik14"))
    ap.add_argument("--out", default="stats", type=Path, help="directory for the SVG cards")
    ap.add_argument("--json", type=Path, help="also write the numbers as JSON (for the site)")
    ap.add_argument("--no-svg", action="store_true", help="skip the SVG cards")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        sys.exit("set GITHUB_TOKEN (e.g. GITHUB_TOKEN=$(gh auth token))")

    user = fetch(args.user, token)
    today = date.today()
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(summary(user, today), separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"wrote {args.json}")
    if args.no_svg:
        return
    args.out.mkdir(parents=True, exist_ok=True)
    for name, svg in (
        ("overview.svg", overview_card(user)),
        ("languages.svg", languages_card(user)),
        ("activity.svg", activity_card(user, today)),
    ):
        (args.out / name).write_text(svg, encoding="utf-8")
        print(f"wrote {args.out / name}")


if __name__ == "__main__":
    main()
