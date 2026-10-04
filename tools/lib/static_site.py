"""Collect the playable static site and prepare portable asset/module URLs."""

import json
import posixpath
import re
from html.parser import HTMLParser


IMPORTS = re.compile(
    r"(?:^\s*import\s+(?:[^;]*?\s+from\s+)?|\bimport\s*\(\s*)[\"']([^\"']+)[\"']",
    re.MULTILINE,
)
# The viewer selector uses import(mode === '2d' ? '/js/...' : '/js/...').
DYNAMIC_SCRIPTS = re.compile(r"[\"'](/js/[^\"']+\.js)[\"']")
ASSET_PATTERNS = (
    "assets/facilities/*-v1.webp",
    "assets/race-2d-backgrounds/*-v1.png",
)
ASSETS = (
    "assets/moogle/trainer.png",
    "assets/commentators/lamia.png",
    "assets/commentators/sahagin.png",
    "assets/chocobo-v3/manifest.json",
    "assets/chocobo-v3/chocobo-v3.glb",
    "assets/chocobo/chocobo-racer.glb",  # The 3D viewer's fallback model.
    "vendor/three/LICENSE",
    *[f"assets/chocobo-portraits/{stage}-idle-v3.png" for stage in ("chick", "yearling", "adult")],
    *[f"assets/home-backgrounds/{season}-v1.webp" for season in ("spring", "summer", "autumn", "winter")],
    *[f"assets/shiroma/shiroma-{expression}.png" for expression in (
        "neutral", "talk", "happy", "motivated", "sad", "disappointed", "overjoyed", "ambiguous-smile"
    )],
)


class EntryPage(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.references = []
        self.import_map = {}
        self.import_map_text = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.references.append(attrs["href"])
        if tag == "script":
            if "src" in attrs:
                self.references.append(attrs["src"])
            if attrs.get("type") == "importmap":
                self.import_map_text = ""

    def handle_data(self, data):
        if self.import_map_text is not None:
            self.import_map_text += data

    def handle_endtag(self, tag):
        if tag == "script" and self.import_map_text is not None:
            self.import_map.update(json.loads(self.import_map_text).get("imports", {}))
            self.import_map_text = None


def local_reference(reference, parent="index.html"):
    if re.match(r"^[a-zA-Z][a-zA-Z\d+.-]*:", reference) or reference.startswith("//"):
        raise ValueError(f"External dependency cannot be bundled: {reference}")
    reference = reference.split("?", 1)[0].split("#", 1)[0]
    name = posixpath.normpath(reference.lstrip("/") if reference.startswith("/")
                             else posixpath.join(posixpath.dirname(parent), reference))
    if name == ".." or name.startswith("../") or "\\" in name:
        raise ValueError(f"Reference escapes public/: {reference}")
    return name


def collect_files(source):
    """Follow entry-page scripts/imports and include the current runtime artwork."""
    source = source.resolve()
    files = set()

    def add(name):
        name = local_reference("/" + name)
        path = source / name
        if not path.resolve().is_relative_to(source):
            raise ValueError(f"File escapes public/: {name}")
        if not path.is_file():
            raise FileNotFoundError(f"Required file is missing: public/{name}")
        files.add(name)
        return path

    page = EntryPage(add("index.html").read_text(encoding="utf-8"))
    pending = [local_reference(ref) for ref in page.references]
    pending += [local_reference(ref) for ref in page.import_map.values()]
    visited = set()
    while pending:
        name = pending.pop()
        if name in visited:
            continue
        visited.add(name)
        path = add(name)
        if path.suffix == ".js":
            text = path.read_text(encoding="utf-8")
            for ref in IMPORTS.findall(text) + DYNAMIC_SCRIPTS.findall(text):
                if ref in page.import_map:
                    pending.append(local_reference(page.import_map[ref]))
                elif ref.startswith(("/", "./", "../")):
                    pending.append(local_reference(ref, name))
                else:
                    raise ValueError(f"Unmapped module in {name}: {ref}")

    for name in ASSETS:
        add(name)
    for pattern in ASSET_PATTERNS:
        matches = sorted(source.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"No runtime assets match: public/{pattern}")
        for path in matches:
            add(path.relative_to(source).as_posix())

    sprite_directory = "assets/chocobo-sprite-study/v5/"
    manifest = json.loads(add(sprite_directory + "manifest.json").read_text(encoding="utf-8"))
    # The main manifest embeds all motion variants; source images/masks and the
    # per-motion authoring manifests are not requested by the game.
    for motion in [manifest, *manifest.get("motions", {}).values()]:
        for kind in ("body", "crest"):
            for sprite in motion[kind].values():
                add(local_reference(sprite["file"], sprite_directory + "manifest.json"))
    return sorted(files)


def release_text(name, text):
    """Resolve root URLs for hosting below a subdirectory without editing sources."""
    if name.endswith((".html", ".js")):
        for directory in ("assets", "js", "vendor"):
            # DOM image/fetch URLs resolve against index.html; module imports
            # resolve against the importing JS file instead.
            base = posixpath.dirname(name) if name.endswith(".js") and directory != "assets" else ""
            relative = posixpath.relpath(directory, base or ".") + "/"
            if not relative.startswith("."):
                relative = "./" + relative
            text = re.sub(r"([\"'`])/" + directory + "/", lambda m: m[1] + relative, text)
    elif name.endswith(".css"):
        text = re.sub(r"(url\(\s*[\"']?)/assets/", r"\1../assets/", text)
    return text

