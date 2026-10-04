#!/usr/bin/env python3
"""Package the playable ranch for PLiCy using only Python's standard library."""

import argparse
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lib.static_site import EntryPage, collect_files, local_reference
from lib.static_site import release_text as portable_text


REPO = Path(__file__).resolve().parent.parent


def release_text(name, text):
    text = portable_text(name, text)
    if name == "js/race-viewer.js":
        text = text.replace("new THREE.WebGLRenderer({", "new THREE.WebGLRenderer({preserveDrawingBuffer:true,")
    return text


def build_zip(source, output):
    files = collect_files(source)  # Validate before touching an existing ZIP.
    if output.suffix.lower() != ".zip":
        raise ValueError("Output filename must end in .zip")
    if output.resolve().is_relative_to(source.resolve()):
        raise ValueError("Write the release ZIP outside public/")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".tmp", delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
            for name in files:
                path = source / name
                if path.suffix in (".html", ".js", ".css"):
                    archive.writestr(name, release_text(name, path.read_text(encoding="utf-8")))
                else:
                    archive.write(path, arcname=name)
        with ZipFile(temporary) as archive:
            broken = archive.testzip()
            if broken is not None:
                raise ValueError(f"ZIP integrity check failed: {broken}")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=REPO / "dist" / "hanekaze-ranch-plicy.zip",
                        help="ZIP filename (default: dist/hanekaze-ranch-plicy.zip)")
    parser.add_argument("--list", action="store_true", help="Validate and list files without creating a ZIP")
    args = parser.parse_args()
    try:
        source = REPO / "public"
        if args.list:
            print("\n".join(collect_files(source)))
        else:
            output = args.output.resolve()
            files = build_zip(source, output)
            print(f"Created: {output}")
            print(f"Files: {len(files)} | ZIP: {output.stat().st_size / 1024 ** 2:.2f} MiB")
            print("index.html is at ZIP root. Check gameplay and thumbnail capture on PLiCy before publishing.")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Packaging failed: {error}\n")


if __name__ == "__main__":
    main()
