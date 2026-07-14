import importlib.util
import json
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "skills" / "wiki-ingest" / "scripts" / "youtube_transcript.py"
ROOT = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location("skill_youtube_transcript", SCRIPT)
youtube = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(youtube)


class FakeFetchedTranscript:
    video_id = "dQw4w9WgXcQ"
    language = "简体中文"
    language_code = "zh-Hans"
    is_generated = True

    def to_raw_data(self):
        return [
            {"text": "你好，世界 👋", "start": 1.9, "duration": 2},
            {"text": "Second\nline", "start": 65.2, "duration": 3},
        ]


class FakeTranscript:
    def fetch(self):
        return FakeFetchedTranscript()


class FakeTranscriptList:
    def __init__(self, fail_preferred=False):
        self.fail_preferred = fail_preferred
        self.requested = None
        self.fallback = FakeTranscript()

    def find_transcript(self, languages):
        self.requested = languages
        if self.fail_preferred:
            raise LookupError("preferred unavailable")
        return FakeTranscript()

    def __iter__(self):
        return iter([self.fallback])


class FakeApi:
    def __init__(self, transcript_list):
        self.transcript_list = transcript_list

    def list(self, video_id):
        self.video_id = video_id
        return self.transcript_list


class YouTubeTranscriptTests(unittest.TestCase):
    def test_parses_supported_url_forms(self):
        video_id = "dQw4w9WgXcQ"
        urls = [
            f"https://www.youtube.com/watch?v={video_id}&t=3",
            f"https://m.youtube.com/watch?v={video_id}",
            f"https://youtu.be/{video_id}?si=x",
            f"https://www.youtube.com/shorts/{video_id}",
            f"https://www.youtube.com/embed/{video_id}",
            f"https://www.youtube.com/live/{video_id}",
        ]
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(youtube.parse_video_id(url), video_id)
        with self.assertRaisesRegex(ValueError, "video ID"):
            youtube.parse_video_id("https://www.youtube.com/playlist?list=PL123")

    def test_language_order_and_any_transcript_fallback(self):
        preferred = FakeTranscriptList()
        result = youtube.fetch_transcript(
            "dQw4w9WgXcQ", ["zh-Hans", "zh", "en"], lambda: FakeApi(preferred)
        )
        self.assertIsInstance(result, FakeFetchedTranscript)
        self.assertEqual(preferred.requested, ["zh-Hans", "zh", "en"])

        fallback = FakeTranscriptList(fail_preferred=True)
        result = youtube.fetch_transcript(
            "dQw4w9WgXcQ", ["zh-Hans", "zh", "en"], lambda: FakeApi(fallback)
        )
        self.assertIsInstance(result, FakeFetchedTranscript)

    def test_oembed_title_and_fallback(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                pass

            def read(self):
                return json.dumps({"title": "真实标题"}).encode("utf-8")

        self.assertEqual(youtube.resolve_title("dQw4w9WgXcQ", lambda *_args, **_kwargs: Response()), "真实标题")

        def broken(*_args, **_kwargs):
            raise OSError("offline")

        self.assertEqual(
            youtube.resolve_title("dQw4w9WgXcQ", broken),
            "YouTube Transcript dQw4w9WgXcQ",
        )

    def test_writes_utf8_timestamped_markdown_and_avoids_collisions(self):
        transcript_list = FakeTranscriptList()
        temp = Path(tempfile.mkdtemp(prefix=".tmp-youtube-test-", dir=ROOT))
        try:
            vault = temp
            kwargs = {
                "url": "https://youtu.be/dQw4w9WgXcQ",
                "vault": vault,
                "languages": ["zh-Hans", "zh", "en"],
                "api_factory": lambda: FakeApi(transcript_list),
                "title_resolver": lambda _video_id: "真实 标题",
                "today": lambda: date(2026, 7, 13),
            }
            first = youtube.ingest_youtube(**kwargs)
            second = youtube.ingest_youtube(**kwargs)

            self.assertEqual(first["sourceFile"], "真实-标题.md")
            self.assertEqual(second["sourceFile"], "真实-标题-2.md")
            self.assertEqual(first["snippetCount"], 2)
            self.assertEqual(first["characterCount"], len("你好，世界 👋\nSecond line"))
            raw = Path(first["sourcePath"]).read_bytes()
            content = raw.decode("utf-8")
            self.assertIn('title: "真实 标题"', content)
            self.assertIn("type: video-transcript", content)
            self.assertIn("fetched: 2026-07-13", content)
            self.assertIn("[0:01] 你好，世界 👋", content)
            self.assertIn("[1:05] Second line", content)
        finally:
            shutil.rmtree(temp)

    def test_transcript_failure_writes_nothing(self):
        class BrokenApi:
            def list(self, _video_id):
                raise RuntimeError("upstream blocked")

        temp = Path(tempfile.mkdtemp(prefix=".tmp-youtube-test-", dir=ROOT))
        try:
            vault = temp
            with self.assertRaisesRegex(RuntimeError, "upstream blocked"):
                youtube.ingest_youtube(
                    "https://youtu.be/dQw4w9WgXcQ",
                    vault,
                    ["zh-Hans", "zh", "en"],
                    api_factory=BrokenApi,
                )
            self.assertFalse((vault / "sources").exists())
        finally:
            shutil.rmtree(temp)


if __name__ == "__main__":
    unittest.main()
