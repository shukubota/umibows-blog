"""
Download 9x9 Go games from the OGS bulk dataset (za3k.com mirror).

KGS no longer supports zip downloads, so this script uses the OGS
collection instead. The 100K sample contains ~39K 9x9 games which is
sufficient for supervised pre-training.

Usage:
  python scripts/igo/download_ogs_9x9.py --output ~/ogs-9x9.jsonl
  python scripts/igo/download_ogs_9x9.py --output ~/ogs-9x9.jsonl --sample 100k
"""

import argparse
import gzip
import io
import json
import sys
import urllib.request
from pathlib import Path

SOURCES = {
    "1k":   "https://za3k.com/ogs/sample-1k.json.gz",
    "100k": "https://za3k.com/ogs/sample-100k.json.gz",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(Path.home() / "ogs-9x9.jsonl"))
    parser.add_argument("--sample", choices=["1k", "100k"], default="100k",
                        help="Which OGS sample to download (default: 100k, ~80MB)")
    parser.add_argument("--min-moves", type=int, default=10,
                        help="Skip games shorter than this many moves (default: 10)")
    args = parser.parse_args()

    url = SOURCES[args.sample]
    print(f"Downloading {url} ...")
    import subprocess, tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.run(["curl", "-sL", "--retry", "3", "-o", tmp_path, url], check=True)
        with open(tmp_path, "rb") as f:
            compressed = f.read()
    finally:
        os.unlink(tmp_path)
    print(f"Downloaded {len(compressed) / 1024 / 1024:.1f} MB, decompressing...")

    raw = gzip.decompress(compressed).decode()
    lines = raw.strip().split("\n")
    print(f"Total games in sample: {len(lines):,}")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    kept = 0
    with out_path.open("w") as f:
        for line in lines:
            try:
                g = json.loads(line)
            except json.JSONDecodeError:
                continue
            if g.get("width") != 9 or g.get("height") != 9:
                continue
            moves = g.get("moves", [])
            if len(moves) < args.min_moves:
                continue
            winner = g.get("winner")
            if winner not in (g.get("black_player_id"), g.get("white_player_id")):
                continue  # unknown outcome — skip
            f.write(json.dumps({
                "black_id": g["black_player_id"],
                "white_id": g["white_player_id"],
                "winner":   winner,
                "moves":    [[m[0], m[1]] for m in moves],  # drop timestamp
            }) + "\n")
            kept += 1

    print(f"Saved {kept:,} 9x9 games → {out_path}")


if __name__ == "__main__":
    main()
