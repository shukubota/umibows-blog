"""
Download KGS monthly zip archives and extract 9x9 SGF files.

Usage:
  python scripts/igo/download_kgs_9x9.py --output ~/kgs-sgf/ --months 24
"""

import argparse
import io
import os
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
import urllib.request

# KGS users to download from.
# Mix of human strong players and bots — 9x9 games are rare for top players,
# but bots and mid-level players produce them more often.
USERS = [
    # Top100 human/bot players
    "schoolboy", "Tetris", "Frog225", "wh1rled", "moezo5",
    "tamm", "CUCUI777", "hirom", "zchen", "Amazato",
    "dejawu", "OohAah", "Fredda", "Kaminoitte", "ben0",
    "rockhard", "whuang", "Whitebunny", "loct", "ccdrunkgo",
    "sdg", "oldsan", "kaiqilol", "Fusion", "Miserrhino",
    "breezemoon", "Kurosawa", "smartfish", "vegetarian", "Cassis0",
    "wildcat", "fastgun", "albatross2", "hobbits", "Brandon",
    "gaopo", "gomancer", "HandyDandy", "BenNavis", "dandylee",
    "Ammit", "ppp", "chau", "stakeout", "fearless74",
    "Crazywind", "Destroyerb", "gomj", "Rav3n", "sai1732",
    # Discovered 9x9 players (found from initial crawl)
    "odorizhou", "ryansun",
    # Bots that often play multiple board sizes
    "GnuGo", "HikaruBot", "BetaOne", "DeepAlpha", "SwissBot1",
    "Leela", "leela", "gnugo", "MoGoBot", "AyaBot",
    "fuego", "Fuego", "RayBot", "ZenBot", "pachi",
]

SGF_SIZE = re.compile(r"SZ\[(\d+)\]")


def is_9x9(text: str) -> bool:
    m = SGF_SIZE.search(text)
    return m is not None and int(m.group(1)) == 9


def download_month(user: str, year: int, month: int, out_dir: Path) -> int:
    url = f"https://www.gokgs.com/servlet/archives/ja_JP/{user}-{year}-{month}.zip"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
    except Exception:
        return 0

    count = 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                if not name.lower().endswith(".sgf"):
                    continue
                text = zf.read(name).decode("utf-8", errors="ignore")
                if is_9x9(text):
                    dest = out_dir / Path(name).name
                    dest.write_text(text)
                    count += 1
    except zipfile.BadZipFile:
        pass
    return count


def iter_months(n_months: int):
    today = date.today()
    y, m = today.year, today.month
    for _ in range(n_months):
        yield y, m
        m -= 1
        if m == 0:
            m = 12
            y -= 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.path.expanduser("~/kgs-sgf/"))
    parser.add_argument("--months", type=int, default=24, help="How many months back to fetch")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    months = list(iter_months(args.months))
    tasks = [(user, y, m) for user in USERS for y, m in months]
    total = 0
    done = 0

    print(f"Downloading {len(tasks)} user-months ({len(USERS)} users × {args.months} months)...")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(download_month, u, y, m, out_dir): (u, y, m) for u, y, m in tasks}
        for fut in as_completed(futs):
            done += 1
            n = fut.result()
            if n:
                u, y, m = futs[fut]
                print(f"  {u} {y}/{m:02d}: {n} 9x9 game(s)  [total so far: {total + n}]")
            total += n
            if done % 100 == 0:
                print(f"  ... {done}/{len(tasks)} done, {total} 9x9 files found")

    sgf_files = list(out_dir.glob("*.sgf"))
    print(f"\nDone. {total} 9x9 SGF files saved to {out_dir}  ({len(sgf_files)} total files in dir)")


if __name__ == "__main__":
    main()
