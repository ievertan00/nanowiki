"""JSON bridge from the Node CLI to youtube-transcript-api."""

import json
import sys


# Redirected stdio inherits a legacy code page on some Windows installations.
# Transcript text is arbitrary Unicode, so make the JSON boundary deterministic.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def main() -> None:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ModuleNotFoundError:
        print(
            "youtube-transcript-api is not installed; run "
            "python -m pip install -r requirements-youtube.txt",
            file=sys.stderr,
        )
        raise SystemExit(2)

    transcript = YouTubeTranscriptApi().fetch(sys.argv[1], languages=json.loads(sys.argv[2]))
    json.dump(
        {
            "video_id": transcript.video_id,
            "language": transcript.language,
            "language_code": transcript.language_code,
            "is_generated": transcript.is_generated,
            "snippets": transcript.to_raw_data(),
        },
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # Preserve the library's actionable exception name.
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
