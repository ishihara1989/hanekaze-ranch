"""Verify the release archive, URL resolution and failure behavior."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urljoin
from zipfile import ZipFile


REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
spec = importlib.util.spec_from_file_location("package_plicy", REPO / "tools/package-plicy.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names = package.collect_files(REPO / "public")

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "public"
        # Keep real code/manifests but use tiny dummy art to test archive layout
        # without repeatedly compressing the full production asset collection.
        for name in self.names:
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            original = REPO / "public" / name
            target.write_bytes(original.read_bytes() if original.suffix in (".html", ".js", ".css", ".json")
                               or original.name == "LICENSE" else b"test artwork")

    def test_archive_contains_runtime_only_and_preserves_source(self):
        index = (self.source / "index.html").read_bytes()
        output = self.root / "release.zip"
        package.build_zip(self.source, output)
        self.assertEqual(index, (self.source / "index.html").read_bytes())
        with ZipFile(output) as archive:
            self.assertIsNone(archive.testzip())
            names = set(archive.namelist())
            self.assertEqual(names, set(self.names))
            self.assertIn("index.html", names)
            self.assertIn("js/race-viewer-2d.js", names)
            self.assertNotIn("js/race-viewer.js", names)
            self.assertFalse(any(name.startswith(("vendor/", "assets/chocobo/", "assets/chocobo-v3/"))
                                 or name.endswith((".glb", ".blend")) for name in names))
            self.assertFalse(any(name.startswith("public/") or "preview" in name
                                 or name.endswith((".blend", ".zip", ".md")) for name in names))
            self.assertNotIn("js/game.js", names)
            self.assertNotIn("js/balance-lab.js", names)
            manifest = json.loads(archive.read("assets/chocobo-sprite-study/v5/manifest.json"))
            self.assertEqual(set(manifest["motions"]), {"walk", "spurt", "podium"})
            for motion in [manifest, *manifest["motions"].values()]:
                for kind in ("body", "crest"):
                    for sprite in motion[kind].values():
                        self.assertIn("assets/chocobo-sprite-study/v5/" + sprite["file"], names)
            for name in names:
                if name.endswith((".html", ".js", ".css")):
                    self.assertNotRegex(archive.read(name).decode("utf-8"), r"[\"'`]/(?:assets|js|vendor)/")
            page = package.EntryPage(archive.read("index.html").decode("utf-8"))
            for ref in page.references + list(page.import_map.values()):
                self.assertIn(package.local_reference(ref), names)
            self.assertEqual(page.import_map, {})

    def test_urls_keep_the_game_subdirectory(self):
        base = "https://example.test/games/42/index.html"
        ui = package.release_text("js/ranch-ui.js", (self.source / "js/ranch-ui.js").read_text(encoding="utf-8"))
        self.assertIn("import('./race-viewer-2d.js')", ui)
        self.assertEqual(urljoin(urljoin(base, "js/ranch-ui.js"), "./race-viewer-2d.js"),
                         "https://example.test/games/42/js/race-viewer-2d.js")
        viewer = package.release_text("js/race-viewer-2d.js", (self.source / "js/race-viewer-2d.js").read_text(encoding="utf-8"))
        self.assertIn("from './race-playback.js'", viewer)
        self.assertEqual(urljoin(urljoin(base, "js/race-viewer-2d.js"), "./race-playback.js"),
                         "https://example.test/games/42/js/race-playback.js")
        portraits = package.release_text("js/ranch-portraits.js", (self.source / "js/ranch-portraits.js").read_text(encoding="utf-8"))
        self.assertIn("'./assets/chocobo-portraits/'", portraits)
        self.assertEqual(urljoin(base, "./assets/chocobo-portraits/adult-idle-v3.png"),
                         "https://example.test/games/42/assets/chocobo-portraits/adult-idle-v3.png")

    def test_missing_dependency_keeps_previous_zip(self):
        for name in ("index.html", "js/race-viewer-2d.js", "js/race-playback.js",
                     "assets/chocobo-sprite-study/v5/spurt/body-blue.png"):
            with self.subTest(name=name):
                path = self.source / name
                original = path.read_bytes()
                path.unlink()
                output = self.root / "previous.zip"
                output.write_bytes(b"previous release")
                try:
                    with self.assertRaises(FileNotFoundError):
                        package.build_zip(self.source, output)
                    self.assertEqual(output.read_bytes(), b"previous release")
                    self.assertEqual(list(self.root.glob("*.tmp")), [])
                finally:
                    path.write_bytes(original)

    def test_rejects_paths_outside_source_and_output_inside_source(self):
        with self.assertRaises(ValueError):
            package.local_reference("../../private.json", "js/example.js")
        with self.assertRaises(ValueError):
            package.local_reference("https://example.test/script.js")
        with self.assertRaises(ValueError):
            package.build_zip(self.source, self.source / "release.zip")
        with self.assertRaises(ValueError):
            package.build_zip(self.source, self.root / "release.txt")


if __name__ == "__main__":
    unittest.main()
