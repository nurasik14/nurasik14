"""Tests for scripts/wakatime_stats.py and scripts/weekly_digest.py.

    python3 -m unittest discover -s tests/scripts

No network: the WakaTime payload below has the shape of
/users/current/summaries; git runs against a throwaway repo.
"""

import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import wakatime_stats as waka  # noqa: E402
import weekly_digest as wd  # noqa: E402


def day(ds, total, cats, projects, langs):
    item = lambda d: [{"name": k, "total_seconds": v} for k, v in d.items()]  # noqa: E731
    return {
        "range": {"date": ds},
        "grand_total": {"total_seconds": total},
        "categories": item(cats),
        "projects": item(projects),
        "languages": item(langs),
        "editors": item({"Neovim": total}),
    }


class Aggregate(unittest.TestCase):
    def test_sums_days_and_fills_gaps(self):
        days = [
            day("2026-11-02", 3600, {"Coding": 3000, "Debugging": 600}, {"overworld": 3600}, {"QML": 3600}),
            day("2026-11-04", 1800, {"Learning": 1800}, {"kazakh_rag": 1800}, {"Python": 1800}),
        ]
        s = waka.aggregate(days, date(2026, 11, 2), date(2026, 11, 8))
        self.assertEqual(s["total_seconds"], 5400)
        self.assertEqual(s["active_days"], 2)
        self.assertEqual(len(s["days"]), 7)
        self.assertEqual(s["days"][1], {"date": "2026-11-03", "seconds": 0, "categories": {}})
        self.assertEqual(s["days"][0]["categories"], {"Coding": 3000, "Debugging": 600})
        self.assertEqual([c["name"] for c in s["categories"]], ["Coding", "Learning", "Debugging"])
        self.assertAlmostEqual(sum(c["percent"] for c in s["categories"]), 100.0, places=0)
        self.assertEqual(s["projects"][0], {"name": "overworld", "seconds": 3600, "percent": 66.7})

    def test_folds_tail_into_other_and_drops_noise(self):
        projects = {f"p{i}": 600 for i in range(15)} | {"blip": 5}
        s = waka.aggregate([day("2026-11-02", 9005, {"Coding": 9005}, projects, {})], date(2026, 11, 2), date(2026, 11, 2))
        names = [p["name"] for p in s["projects"]]
        self.assertEqual(len(names), waka.TOP + 1)
        self.assertEqual(names[-1], "Other")
        self.assertNotIn("blip", names)

    def test_hm(self):
        self.assertEqual(waka.hm(59 * 60), "59m")
        self.assertEqual(waka.hm(3 * 3600 + 5 * 60), "3h 05m")


class Week(unittest.TestCase):
    def test_current_week_ends_now(self):
        now = datetime(2026, 11, 11, 15, 0, tzinfo=wd.TZ)  # a Wednesday
        label, first, last, start, end = wd.week_bounds(None, now)
        self.assertEqual((label, first, last), ("2026-W46", date(2026, 11, 9), date(2026, 11, 11)))
        self.assertEqual(end, now)

    def test_past_week(self):
        now = datetime(2026, 11, 11, tzinfo=wd.TZ)
        label, first, last, start, end = wd.week_bounds("2026-W45", now)
        self.assertEqual((first, last), (date(2026, 11, 2), date(2026, 11, 8)))
        self.assertEqual(end, datetime(2026, 11, 9, tzinfo=wd.TZ))


class Git(unittest.TestCase):
    def test_counts_only_my_commits_and_skips_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("proj", "quest-data"):
                r = root / name
                r.mkdir()
                subprocess.run(["git", "init", "-q", str(r)], check=True)
                for who in ("me", "me", "someone"):
                    env = os.environ | {
                        "GIT_AUTHOR_NAME": who, "GIT_AUTHOR_EMAIL": f"{who}@x",
                        "GIT_COMMITTER_NAME": who, "GIT_COMMITTER_EMAIL": f"{who}@x",
                        "GIT_AUTHOR_DATE": "2026-11-03T12:00:00+08:00",
                        "GIT_COMMITTER_DATE": "2026-11-03T12:00:00+08:00",
                    }
                    subprocess.run(["git", "-C", str(r), "commit", "-q", "--allow-empty", "-m", f"by {who}"],
                                   check=True, env=env)
            start = datetime(2026, 11, 2, tzinfo=wd.TZ)
            end = datetime(2026, 11, 9, tzinfo=wd.TZ)
            g = wd.git_commits(start, end, [root], ["me@x"], exclude=["quest-data"])
            self.assertEqual(g["total"], 2)
            self.assertEqual([r["name"] for r in g["repos"]], ["proj"])
            self.assertEqual(g["per_day"], {"2026-11-03": 2})


class Highlights(unittest.TestCase):
    def test_errors_are_skipped_not_guessed(self):
        d = {"wakatime": {"error": "no token"}, "git": {"total": 0, "repos": []}, "lastfm": {"error": "x"}}
        self.assertEqual(wd.highlights(d), ["No commits this week."])


if __name__ == "__main__":
    unittest.main()
