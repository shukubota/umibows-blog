#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["mcp"]
# ///
"""LINE group messenger MCP server.

Exposes a single tool: send_line_message(text)
Channel is fixed via environment variables (loaded from .env in this directory).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from mcp.server.fastmcp import FastMCP

PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push"


def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

mcp = FastMCP("line-group-messenger")


def _get_credentials() -> tuple:
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    group_id = os.environ.get("LINE_TARGET_GROUP_ID")
    if not token:
        return None, None, "Error: LINE_CHANNEL_ACCESS_TOKEN is not set"
    if not group_id:
        return None, None, "Error: LINE_TARGET_GROUP_ID is not set"
    return token, group_id, ""


def _push(token: str, group_id: str, messages: list) -> str:
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
            return f"Sent successfully (HTTP {resp.status})"
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        return f"HTTPError {e.code}: {detail}"
    except urllib.error.URLError as e:
        return f"URLError: {e.reason}"


@mcp.tool()
def send_line_message(text: str) -> str:
    """Send a text message to the configured LINE group.

    Args:
        text: Message body to send (plain text, up to 5000 chars).
    """
    token, group_id, err = _get_credentials()
    if err:
        return err
    return _push(token, group_id, [{"type": "text", "text": text}])


@mcp.tool()
def send_line_sticker(package_id: str = "446", sticker_id: str = "2000") -> str:
    """Send a sticker to the configured LINE group.

    Args:
        package_id: Sticker package ID (default "446" — basic pack).
        sticker_id: Sticker ID within the package (default "2000" — cute smile).

    Common packages:
      446   basic — 1988 OK, 1989 Thank you, 1990 Sorry, 2000 Smile, 2001 Surprised
      11537 CONY  — 52002734 Happy, 52002735 Cheers, 52002736 Wave
      11538 BROWN — 51626494 Hello, 51626502 OK, 51626508 Love
    """
    token, group_id, err = _get_credentials()
    if err:
        return err
    return _push(token, group_id, [{"type": "sticker", "packageId": package_id, "stickerId": sticker_id}])


@mcp.tool()
def send_line_image(original_url: str, preview_url: str = "") -> str:
    """Send an image to the configured LINE group.

    Args:
        original_url: HTTPS URL of the full-resolution image (JPEG/PNG, max 10 MB).
        preview_url:  HTTPS URL of the preview thumbnail (JPEG/PNG, max 1 MB).
                      Defaults to original_url when omitted.
    """
    token, group_id, err = _get_credentials()
    if err:
        return err
    preview = preview_url or original_url
    return _push(token, group_id, [{"type": "image", "originalContentUrl": original_url, "previewImageUrl": preview}])


if __name__ == "__main__":
    mcp.run()
