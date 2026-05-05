#!/usr/bin/env python3
"""LINE Messaging API push message sender.

Reads a JSON payload from stdin:
    {"messages": [<message1>, <message2>, ...]}

Up to 5 messages per request. Sends to LINE_TARGET_GROUP_ID using
the bearer token in LINE_CHANNEL_ACCESS_TOKEN.

Exit codes:
    0 = success
    1 = HTTP/network error
    2 = configuration or input error
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push"


def fail(msg: str, code: int = 2) -> None:
    sys.stderr.write(f"Error: {msg}\n")
    sys.exit(code)


def load_dotenv_if_present() -> None:
    """Load env vars from a .env file in the skill root.

    Looks for .env at <skill_root>/.env (one level above this script).
    Does NOT overwrite vars that are already set in the environment.
    Format: simple `KEY=VALUE` per line. Comments starting with # ignored.
    Quotes (single or double) around VALUE are stripped.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> None:
    load_dotenv_if_present()
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    group_id = os.environ.get("LINE_TARGET_GROUP_ID")
    if not token:
        fail("LINE_CHANNEL_ACCESS_TOKEN is not set")
    if not group_id:
        fail("LINE_TARGET_GROUP_ID is not set")

    try:
        payload_in = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        fail(f"invalid JSON on stdin: {e}")

    messages = payload_in.get("messages")
    if not isinstance(messages, list):
        fail("'messages' must be a list")
    if not (1 <= len(messages) <= 5):
        fail(f"'messages' must contain 1-5 items (got {len(messages)})")

    body = json.dumps(
        {"to": group_id, "messages": messages},
        ensure_ascii=False,
    ).encode("utf-8")

    req = urllib.request.Request(
        PUSH_ENDPOINT,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            text = resp.read().decode("utf-8") or "(empty)"
            print(f"OK ({status}): {text}")
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        sys.stderr.write(f"HTTPError {e.code}: {text}\n")
        sys.exit(1)
    except urllib.error.URLError as e:
        sys.stderr.write(f"URLError: {e.reason}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
