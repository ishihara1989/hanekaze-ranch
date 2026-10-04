#!/usr/bin/env python3
"""Build the playable static site for GitHub Pages with no extra dependencies."""

import argparse
import shutil
import tempfile
from pathlib import Path

from lib.static_site import collect_files, release_text


REPO = Path(__file__).resolve().parent.parent


def build_site(source, output):
    source = source.resolve()
    distribution = source.parent / "dist"
    # Only generated subdirectories under dist/ may be replaced. In particular,
    # reject source folders, dist/ itself and symlinks to other directories.
    if distribution.resolve() != distribution or output.is_symlink():
        raise ValueError("The build output must not use a symlink")
    output = output.resolve()
    if output == distribution or not output.is_relative_to(distribution):
        raise ValueError("Output must be a subdirectory of dist/ (for example dist/pages)")
    files = collect_files(source)
    distribution.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pages-build-", dir=distribution) as temporary:
        staging = Path(temporary) / "site"
        staging.mkdir()
        for name in files:
            original, target = source / name, staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if original.suffix in (".html", ".js", ".css"):
                target.write_text(release_text(name, original.read_text(encoding="utf-8")), encoding="utf-8")
            else:
                shutil.copyfile(original, target)
        (staging / ".nojekyll").touch()
        # Validation and generation finish before an existing build is removed.
        # output has already been resolved and confined to this project's dist/.
        if output.exists():
            shutil.rmtree(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        staging.replace(output)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=REPO / "dist/pages",
                        help="Generated directory under dist/ (default: dist/pages)")
    args = parser.parse_args()
    try:
        files = build_site(REPO / "public", args.output)
        print(f"Built: {args.output.resolve()}")
        print(f"Runtime files: {len(files)} | index.html at site root | portable relative URLs")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Pages build failed: {error}\n")


if __name__ == "__main__":
    main()
