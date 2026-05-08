#!/usr/bin/env python3
"""embed-toolkit installer

Installs each skill as a flat directory under ~/.claude/skills/
so Claude Code can discover them (scans one level deep for SKILL.md).

Shared files go to ~/.claude/skills/embed-toolkit/shared/.

Usage:
  pipx run embed-toolkit              # if published to PyPI
  python3 install.py                  # install from local clone
  python3 install.py --uninstall      # remove installed skills
  python3 install.py --status         # check installation status
  python3 install.py --force          # force reinstall
"""

import os
import shutil
import sys
from pathlib import Path

SKILLS_DIR = Path.home() / ".claude" / "skills"
SHARED_DIR = SKILLS_DIR / "embed-toolkit"
SRC_DIR = Path(__file__).resolve().parent

SKILL_NAMES = [
    "embed-build",
    "embed-flash",
    "embed-serial",
    "embed-debug",
    "embed-diag",
    "embed-workflow",
    "embed-setup",
    "embed-test",
]


def copy_dir(src: Path, dest: Path) -> None:
    """Recursively copy a directory."""
    dest.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dest / item.name
        if item.is_dir():
            copy_dir(item, target)
        else:
            shutil.copy2(item, target)


def remove_dir(d: Path) -> None:
    """Remove a directory tree if it exists."""
    if d.exists():
        shutil.rmtree(d)


def status() -> bool:
    """Print installation status. Returns True if installed."""
    installed = []
    missing = []
    for name in SKILL_NAMES:
        skill_md = SKILLS_DIR / name / "SKILL.md"
        if skill_md.exists():
            installed.append(name)
        else:
            missing.append(name)

    if not installed:
        print("embed-toolkit: NOT INSTALLED")
        return False

    print("embed-toolkit: INSTALLED")
    print(f"  Skills: {len(installed)}/{len(SKILL_NAMES)}")
    for s in installed:
        print(f"    ✓ {s}")
    for s in missing:
        print(f"    ✗ {s} (missing)")
    if SHARED_DIR.exists():
        print(f"  shared: {SHARED_DIR}")
    return True


def install() -> None:
    """Install all skills and shared files."""
    # Check if already installed
    already = any((SKILLS_DIR / name / "SKILL.md").exists() for name in SKILL_NAMES)
    if already:
        print("embed-toolkit: Already installed.")
        print("  Use --force to reinstall, or --uninstall to remove.")
        status()
        return

    print("embed-toolkit installer")
    print(f"  Source: {SRC_DIR}")

    # Install each skill as ~/.claude/skills/<name>/SKILL.md
    skills_src = SRC_DIR / "skills"
    if skills_src.exists():
        for name in SKILL_NAMES:
            src = skills_src / name
            dest = SKILLS_DIR / name
            if src.exists():
                if dest.exists():
                    shutil.rmtree(dest)
                copy_dir(src, dest)
                print(f"  ✓ {name}")
            else:
                print(f"  ✗ {name} (source not found)")

    # Install shared/ to ~/.claude/skills/embed-toolkit/shared/
    shared_src = SRC_DIR / "shared"
    shared_dest = SHARED_DIR / "shared"
    if shared_src.exists():
        if shared_dest.exists():
            shutil.rmtree(shared_dest)
        copy_dir(shared_src, shared_dest)
        print("  ✓ embed-toolkit/shared/")

    # Install templates/ to ~/.claude/skills/embed-toolkit/templates/
    tmpl_src = SRC_DIR / "templates"
    tmpl_dest = SHARED_DIR / "templates"
    if tmpl_src.exists():
        if tmpl_dest.exists():
            shutil.rmtree(tmpl_dest)
        copy_dir(tmpl_src, tmpl_dest)
        print("  ✓ embed-toolkit/templates/")

    print()
    print("embed-toolkit installed successfully!")
    print()
    print("Available skills:")
    for name in SKILL_NAMES:
        print(f"  /{name}")


def force_install() -> None:
    """Remove old installation and reinstall."""
    # Remove old-style nested install
    remove_dir(SKILLS_DIR / "embed-toolkit" / "skills")
    # Remove each skill dir
    for name in SKILL_NAMES:
        remove_dir(SKILLS_DIR / name)
    print("  Removed previous installation.")
    install()


def uninstall() -> None:
    """Remove all installed skills and shared directory."""
    removed = 0
    for name in SKILL_NAMES:
        d = SKILLS_DIR / name
        if d.exists():
            remove_dir(d)
            print(f"  ✓ removed {name}")
            removed += 1

    if SHARED_DIR.exists():
        remove_dir(SHARED_DIR)
        print("  ✓ removed embed-toolkit/shared")
        removed += 1

    if removed == 0:
        print("embed-toolkit is not installed.")
    else:
        print()
        print("embed-toolkit uninstalled.")


def main() -> None:
    args = sys.argv[1:]

    if "--uninstall" in args:
        uninstall()
    elif "--status" in args:
        status()
    elif "--force" in args:
        force_install()
    else:
        install()


if __name__ == "__main__":
    main()
