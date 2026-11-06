#!/usr/bin/env python3
"""
setup-webkit-arch.py — Downloads the Ubuntu 24.04 (noble) runtime shared libraries
needed by Playwright's WebKit bundle and extracts them into WebKit's bundled sys/lib
folders so WebKit runs natively on rolling-release Linux distros (Arch / CachyOS)
without requiring root or a container.
"""
import gzip
import os
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

UBUNTU_MIRROR = "https://archive.ubuntu.com/ubuntu"
SUITES = [
    ("noble", "main"),
    ("noble", "universe"),
    ("noble-updates", "main"),
    ("noble-updates", "universe"),
]

PACKAGES_NEEDED = [
    "libicu74",
    "libxml2",
    "libwoff1",
    "libvpx9",
    "libflite1",
    "libavif16",
    "libharfbuzz-icu0",
    "libenchant-2-2",
    "libhyphen0",
    "libmanette-0.2-0",
    "libaom3",
    "libdav1d7",
    "librav1e0",
    "libsvtav1enc1d1",
    "libyuv0",
    "libgav1-1",
    "libevdev2",
    "libgudev-1.0-0",
    "libaspell15",
    "libhunspell-1.7-0",
    "libabsl20220623t64",
]


def find_webkit_dir() -> Path:
    candidates: list[Path] = []
    env_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env_path:
        candidates.extend(Path(env_path).glob("webkit-*"))
    candidates.extend(Path("/tmp/pw-browsers").glob("webkit-*"))
    candidates.extend((Path.home() / ".cache" / "ms-playwright").glob("webkit-*"))
    if not candidates:
        raise SystemExit("No Playwright webkit-* directory found. Run playwright install webkit first.")
    return candidates[0]


def load_package_urls() -> dict[str, str]:
    pkg_urls: dict[str, str] = {}
    for distro, comp in SUITES:
        index_url = f"{UBUNTU_MIRROR}/dists/{distro}/{comp}/binary-amd64/Packages.gz"
        req = urllib.request.Request(index_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = gzip.decompress(resp.read()).decode("utf-8", errors="replace")
        current_pkg = None
        for line in content.splitlines():
            if line.startswith("Package: "):
                current_pkg = line.split(": ", 1)[1].strip()
            elif line.startswith("Filename: ") and current_pkg in PACKAGES_NEEDED:
                rel_path = line.split(": ", 1)[1].strip()
                pkg_urls[current_pkg] = f"{UBUNTU_MIRROR}/{rel_path}"
    return pkg_urls


def main() -> None:
    webkit_dir = find_webkit_dir()
    gtk_sys_lib = webkit_dir / "minibrowser-gtk" / "sys" / "lib"
    wpe_sys_lib = webkit_dir / "minibrowser-wpe" / "sys" / "lib"

    pkg_urls = load_package_urls()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for pkg, url in pkg_urls.items():
            deb_path = tmp / f"{pkg}.deb"
            urllib.request.urlretrieve(url, deb_path)
            extract_dir = tmp / pkg
            extract_dir.mkdir()
            subprocess.run(["ar", "x", str(deb_path)], cwd=extract_dir, check=True)
            data_tars = list(extract_dir.glob("data.tar.*"))
            if not data_tars:
                continue
            unpacked = extract_dir / "root"
            unpacked.mkdir()
            subprocess.run(["tar", "-xf", str(data_tars[0]), "-C", str(unpacked)], check=True)
            for so_file in unpacked.rglob("lib*.so*"):
                for target_dir in (gtk_sys_lib, wpe_sys_lib):
                    dest = target_dir / so_file.name
                    if dest.exists() or dest.is_symlink():
                        dest.unlink()
                    if so_file.is_symlink():
                        os.symlink(os.readlink(so_file), dest)
                    else:
                        shutil.copy2(so_file, dest)


if __name__ == "__main__":
    main()

