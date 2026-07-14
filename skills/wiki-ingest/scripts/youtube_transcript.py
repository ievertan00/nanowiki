"""Fetch a YouTube transcript and write an ingest-ready Markdown source."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen


DEFAULT_LANGUAGES = ("zh-Hans", "zh", "en")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
SLUG_SEPARATOR = re.compile(r"[^a-zA-Z0-9\u4e00-\u9fff]+")


def parse_video_id(value: str) -> str:
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m."):
        host = host[2:]

    candidate = ""
    parts = [part for part in parsed.path.split("/") if part]
    if host == "youtu.be":
        candidate = parts[0] if parts else ""
    elif host == "youtube.com":
        if parsed.path.rstrip("/") == "/watch":
            candidate = parse_qs(parsed.query).get("v", [""])[0]
        elif len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
            candidate = parts[1]

    if not VIDEO_ID.fullmatch(candidate):
        raise ValueError(f"Could not find a valid YouTube video ID in {value}")
    return candidate


def select_transcript(transcript_list: Any, languages: Iterable[str]) -> Any:
    requested = list(languages)
    try:
        return transcript_list.find_transcript(requested)
    except Exception as preferred_error:
        try:
            return next(iter(transcript_list))
        except StopIteration:
            raise preferred_error


def fetch_transcript(video_id: str, languages: Iterable[str], api_factory: Callable[[], Any] | None = None) -> Any:
    if api_factory is None:
        from youtube_transcript_api import YouTubeTranscriptApi

        api_factory = YouTubeTranscriptApi
    transcript_list = api_factory().list(video_id)
    return select_transcript(transcript_list, languages).fetch()


def resolve_title(video_id: str, opener: Callable[..., Any] = urlopen) -> str:
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    endpoint = "https://www.youtube.com/oembed?" + urlencode({"url": watch_url, "format": "json"})
    try:
        with opener(endpoint, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        title = str(payload.get("title", "")).strip()
        if title:
            return title
    except Exception:
        pass
    return f"YouTube Transcript {video_id}"


def format_timestamp(seconds: Any) -> str:
    total = max(0, int(float(seconds or 0)))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def transcript_data(transcript: Any) -> list[dict[str, Any]]:
    if hasattr(transcript, "to_raw_data"):
        return list(transcript.to_raw_data())
    return [
        {
            "text": getattr(snippet, "text", ""),
            "start": getattr(snippet, "start", 0),
            "duration": getattr(snippet, "duration", 0),
        }
        for snippet in transcript
    ]


def format_markdown(title: str, url: str, transcript: Any, fetched: str) -> tuple[str, int, int]:
    snippets = transcript_data(transcript)
    lines: list[str] = []
    character_count = 0
    for snippet in snippets:
        text = re.sub(r"\s+", " ", str(snippet.get("text", ""))).strip()
        if not text:
            continue
        if lines:
            character_count += 1  # The newline separating this snippet from the previous one.
        character_count += len(text)
        lines.append(f"[{format_timestamp(snippet.get('start', 0))}] {text}")
    if not lines:
        raise ValueError("YouTube returned an empty transcript")

    language = str(getattr(transcript, "language", "Unknown"))
    language_code = str(getattr(transcript, "language_code", "unknown"))
    is_generated = bool(getattr(transcript, "is_generated", False))
    markdown = "\n".join(
        [
            "---",
            f"title: {json.dumps(title, ensure_ascii=False)}",
            f"url: {json.dumps(url, ensure_ascii=False)}",
            "type: video-transcript",
            f"fetched: {fetched}",
            "---",
            "",
            "# Transcript",
            "",
            f"- Video ID: {getattr(transcript, 'video_id', '')}",
            f"- Language: {language} ({language_code})",
            f"- Automatically generated: {'yes' if is_generated else 'no'}",
            "",
            "## Transcript",
            "",
            *lines,
            "",
        ]
    )
    return markdown, len(lines), character_count


def slugify(value: str, fallback: str) -> str:
    return SLUG_SEPARATOR.sub("-", value).strip("-") or fallback


def write_collision_safe(sources_dir: Path, slug: str, content: str) -> Path:
    sources_dir.mkdir(parents=True, exist_ok=True)
    counter = 1
    while True:
        suffix = "" if counter == 1 else f"-{counter}"
        target = sources_dir / f"{slug}{suffix}.md"
        try:
            with target.open("x", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
            return target
        except FileExistsError:
            counter += 1


def ingest_youtube(
    url: str,
    vault: Path,
    languages: Iterable[str],
    api_factory: Callable[[], Any] | None = None,
    title_resolver: Callable[[str], str] = resolve_title,
    today: Callable[[], date] = date.today,
) -> dict[str, Any]:
    video_id = parse_video_id(url)
    transcript = fetch_transcript(video_id, languages, api_factory)
    title = title_resolver(video_id)
    markdown, snippet_count, character_count = format_markdown(title, url, transcript, today().isoformat())
    target = write_collision_safe(vault / "sources", slugify(title, video_id), markdown)
    return {
        "sourceTitle": title,
        "sourceFile": target.name,
        "sourcePath": str(target.resolve()),
        "language": str(getattr(transcript, "language_code", "unknown")),
        "isGenerated": bool(getattr(transcript, "is_generated", False)),
        "snippetCount": snippet_count,
        "characterCount": character_count,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--languages", default=",".join(DEFAULT_LANGUAGES))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    languages = [value.strip() for value in args.languages.split(",") if value.strip()]
    if not languages:
        languages = list(DEFAULT_LANGUAGES)
    try:
        metadata = ingest_youtube(args.url, args.vault, languages)
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1
    json.dump(metadata, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
