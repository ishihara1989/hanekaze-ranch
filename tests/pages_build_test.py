"""Check the Pages artifact and its module/asset paths under a project URL."""

import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen


REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
from lib.static_site import EntryPage, IMPORTS, collect_files, local_reference

spec = importlib.util.spec_from_file_location("build_pages", REPO / "tools/build-pages.py")
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class PagesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names = collect_files(REPO / "public")

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "public"
        self.output = self.root / "dist/hanekaze-ranch"
        for name in self.names:
            original, target = REPO / "public" / name, self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original.read_bytes() if original.suffix in (".html", ".js", ".css", ".json")
                               or original.name == "LICENSE" else b"test artwork")

    def test_runtime_only_portable_modules_and_clean_rebuild(self):
        original_index = (self.source / "index.html").read_bytes()
        pages.build_site(self.source, self.output)
        self.assertEqual(original_index, (self.source / "index.html").read_bytes())
        names = {path.relative_to(self.output).as_posix() for path in self.output.rglob("*") if path.is_file()}
        self.assertEqual(names, {*self.names, ".nojekyll"})
        page = EntryPage((self.output / "index.html").read_text(encoding="utf-8"))
        for ref in page.references + list(page.import_map.values()):
            self.assertIn(local_reference(ref), names)
        for name in names:
            if name.endswith((".html", ".js", ".css")):
                text = (self.output / name).read_text(encoding="utf-8")
                self.assertNotRegex(text, r"[\"'`]/(?:assets|js|vendor)/")
                if name.endswith(".js"):
                    for ref in IMPORTS.findall(text):
                        target = local_reference(page.import_map[ref]) if ref in page.import_map else local_reference(ref, name)
                        self.assertIn(target, names)
        self.assertNotIn("js/race-viewer.js", names)
        self.assertFalse(any(name.startswith(("vendor/", "assets/chocobo/", "assets/chocobo-v3/"))
                             or name.endswith((".glb", ".blend")) for name in names))
        self.assertEqual(page.import_map, {})
        ui = (self.output / "js/ranch-ui.js").read_text(encoding="utf-8")
        self.assertIn("import('./race-viewer-2d.js')", ui)
        (self.output / "obsolete.txt").write_text("old build", encoding="utf-8")
        pages.build_site(self.source, self.output)
        self.assertFalse((self.output / "obsolete.txt").exists())

    def test_all_runtime_files_are_served_under_project_path(self):
        pages.build_site(self.source, self.output)
        handler = partial(QuietHandler, directory=str(self.output.parent))
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{server.server_port}/hanekaze-ranch/"
                with urlopen(base) as response:
                    self.assertIn("羽風牧場", response.read().decode("utf-8"))
                for name in self.names:
                    with urlopen(Request(base + name, method="HEAD")) as response:
                        self.assertEqual(response.status, 200, name)
                        if name.endswith(".js"):
                            self.assertIn("javascript", response.headers["Content-Type"])
            finally:
                server.shutdown()
                thread.join()

    def test_missing_source_keeps_previous_site(self):
        pages.build_site(self.source, self.output)
        original_index = (self.output / "index.html").read_bytes()
        (self.source / "assets/chocobo-sprite-study/v5/walk/body-blue.png").unlink()
        with self.assertRaises(FileNotFoundError):
            pages.build_site(self.source, self.output)
        self.assertEqual(original_index, (self.output / "index.html").read_bytes())
        self.assertEqual(list((self.root / "dist").glob("pages-build-*")), [])

    def test_facility_css_urls_use_project_page_directory(self):
        pages.build_site(self.source, self.output)
        # Render the actual built UI for every facility level, including legacy
        # lab saves, at a Pages project URL rather than the local server root.
        for base in ("https://example.test/hanekaze-ranch/",
                     "https://example.test/hanekaze-ranch/index.html"):
            with self.subTest(base=base):
                result = subprocess.run(
                    [shutil.which("node") or "node", "--test", "--test-name-pattern=facility art follows",
                     "tests/ranch-ui.test.cjs"],
                    cwd=REPO, capture_output=True, text=True, encoding="utf-8",
                    env={**os.environ, "RANCH_UI_SOURCE": str(self.output / "js/ranch-ui.js"),
                         "RANCH_UI_BASE_URI": base},
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_output_cannot_replace_source_or_distribution_root(self):
        for output in (self.source, self.root / "dist", self.root / "other"):
            with self.subTest(output=output), self.assertRaises(ValueError):
                pages.build_site(self.source, output)
        self.assertTrue((self.source / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
