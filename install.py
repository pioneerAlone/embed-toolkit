#!/usr/bin/env python3
"""embed-toolkit installer

Installs each skill as a flat directory under skill discovery paths
for Claude Code and OpenCode (auto-detected).

Skill discovery paths:
  - Claude Code:  ~/.claude/skills/<name>/SKILL.md
  - OpenCode:     ~/.config/opencode/skills/<name>/SKILL.md
  - Generic:      ~/.agents/skills/<name>/SKILL.md

Shared files go to <target>/embed-toolkit/{shared,templates}/.

Usage:
  python3 install.py                  # install to all detected targets
  python3 install.py --tool claude    # install only to Claude Code
  python3 install.py --tool opencode  # install only to OpenCode
  python3 install.py --target <dir>   # install to specific directory
  python3 install.py --status         # check installation status
  python3 install.py --force          # force reinstall
  python3 install.py --uninstall      # remove from all targets

See also: install.sh (bash, zero-dependency), install.js (Node.js)
"""

import os
import shutil
import sys
from pathlib import Path

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
    "embed-memory",
    "embed-crash",
    "embed-static",
]


# --- Target discovery ---

def get_default_targets():
    """Return list of {name, skills_dir, shared_dir} dicts for detected tools."""
    home = Path.home()
    targets = []

    # Claude Code — always include (also serves as OpenCode fallback)
    targets.append({
        "name": "Claude Code",
        "type": "claude",
        "skills_dir": home / ".claude" / "skills",
        "shared_dir": home / ".claude" / "skills" / "embed-toolkit",
    })

    # OpenCode — include if its config directory exists
    # OpenCode discovers slash commands from command/*.md (flat files), not skills/<name>/SKILL.md
    opencode_config = home / ".config" / "opencode"
    if opencode_config.exists():
        targets.append({
            "name": "OpenCode",
            "type": "opencode",
            "skills_dir": opencode_config / "skills",
            "shared_dir": opencode_config / "skills" / "embed-toolkit",
            "command_dir": opencode_config / "command",
        })

    # Generic agents path — include if exists
    agents_dir = home / ".agents"
    if agents_dir.exists():
        targets.append({
            "name": "Generic Agents",
            "type": "generic",
            "skills_dir": agents_dir / "skills",
            "shared_dir": agents_dir / "skills" / "embed-toolkit",
        })

    return targets


def make_target(skills_dir):
    """Create a target dict from a custom skills directory path."""
    return {
        "name": skills_dir.name,
        "type": "custom",
        "skills_dir": Path(skills_dir),
        "shared_dir": Path(skills_dir) / "embed-toolkit",
    }


# --- Helpers ---

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
        shutil.rmtree(d, ignore_errors=True)


# --- Operations ---

def check_target_status(target):
    """Return {target, installed, missing} for a single target."""
    installed = []
    missing = []
    is_opencode = target.get("type") == "opencode"
    for name in SKILL_NAMES:
        if is_opencode:
            check_path = target.get("command_dir") / f"{name}.md"
        else:
            check_path = target["skills_dir"] / name / "SKILL.md"
        if check_path.exists():
            installed.append(name)
        else:
            missing.append(name)
    return {"target": target, "installed": installed, "missing": missing}


def show_status(targets):
    """Print installation status for all targets."""
    any_installed = False

    for t in targets:
        s = check_target_status(t)
        if not s["installed"]:
            continue
        any_installed = True
        print(f"embed-toolkit @ {t['name']} ({t['skills_dir']})")
        print(f"  Skills: {len(s['installed'])}/{len(SKILL_NAMES)}")
        for name in s["installed"]:
            print(f"    ✓ {name}")
        for name in s["missing"]:
            print(f"    ✗ {name} (missing)")
        if t["shared_dir"].exists():
            print(f"  shared: {t['shared_dir']}")
        print()

    if not any_installed:
        print("embed-toolkit: NOT INSTALLED")
        for t in targets:
            print(f"  checked: {t['name']} ({t['skills_dir']})")
        return False
    return True


def _convert_to_opencode_command(content):
    """Convert Claude Code skill frontmatter to OpenCode command format.

    OpenCode uses filename for command name, so strip the 'name:' field.
    Keep 'description:', strip 'model:'.
    """
    lines = content.split("\n")
    result = []
    in_frontmatter = False
    frontmatter_ended = False

    for line in lines:
        if line.strip() == "---":
            if not in_frontmatter:
                in_frontmatter = True
                result.append(line)
                continue
            elif not frontmatter_ended:
                frontmatter_ended = True
                in_frontmatter = False
                result.append(line)
                continue
        if in_frontmatter and not frontmatter_ended:
            trimmed = line.strip()
            if trimmed.startswith("name:"):
                continue
            if trimmed.startswith("model:"):
                continue
        result.append(line)

    return "\n".join(result)


def install_to_target(target):
    """Install skills and shared files to a single target."""
    print(f"→ {target['name']} ({target['skills_dir']})")

    if target.get("type") == "opencode":
        # OpenCode: deploy flat .md files to command/ directory
        command_dir = target.get("command_dir")
        command_dir.mkdir(parents=True, exist_ok=True)

        skills_src = SRC_DIR / "skills"
        if skills_src.exists():
            for name in SKILL_NAMES:
                src_skill_md = skills_src / name / "SKILL.md"
                dest_path = command_dir / f"{name}.md"
                if src_skill_md.exists():
                    content = src_skill_md.read_text(encoding="utf-8")
                    content = _convert_to_opencode_command(content)
                    # Convert path references: Claude Code paths → OpenCode paths
                    content = content.replace(
                        "~/.claude/skills/embed-toolkit",
                        "~/.config/opencode/skills/embed-toolkit"
                    )
                    content = content.replace(
                        "$HOME/.claude/skills/embed-toolkit",
                        "$HOME/.config/opencode/skills/embed-toolkit"
                    )
                    dest_path.write_text(content, encoding="utf-8")
                    print(f"  ✓ {name}")
                else:
                    print(f"  ✗ {name} (source not found)")

        # Still install shared/ and templates/ (referenced by command files)
        shared_src = SRC_DIR / "shared"
        shared_dest = target["shared_dir"] / "shared"
        if shared_src.exists():
            remove_dir(shared_dest)
            copy_dir(shared_src, shared_dest)
            print("  ✓ shared/")

        tmpl_src = SRC_DIR / "templates"
        tmpl_dest = target["shared_dir"] / "templates"
        if tmpl_src.exists():
            remove_dir(tmpl_dest)
            copy_dir(tmpl_src, tmpl_dest)
            print("  ✓ templates/")
        return

    # Claude Code / Generic / Custom: deploy skill directories to skills/<name>/SKILL.md
    skills_src = SRC_DIR / "skills"
    if skills_src.exists():
        for name in SKILL_NAMES:
            src = skills_src / name
            dest = target["skills_dir"] / name
            if src.exists():
                remove_dir(dest)
                copy_dir(src, dest)
                print(f"  ✓ {name}")
            else:
                print(f"  ✗ {name} (source not found)")

    # Install shared/
    shared_src = SRC_DIR / "shared"
    shared_dest = target["shared_dir"] / "shared"
    if shared_src.exists():
        remove_dir(shared_dest)
        copy_dir(shared_src, shared_dest)
        print("  ✓ shared/")

    # Install templates/
    tmpl_src = SRC_DIR / "templates"
    tmpl_dest = target["shared_dir"] / "templates"
    if tmpl_src.exists():
        remove_dir(tmpl_dest)
        copy_dir(tmpl_src, tmpl_dest)
        print("  ✓ templates/")


def install(targets):
    """Install to all targets (checks for existing install first)."""
    all_installed = True
    partial_installed = False
    for t in targets:
        s = check_target_status(t)
        if s["installed"]:
            partial_installed = True
        if len(s["installed"]) < len(SKILL_NAMES):
            all_installed = False

    if all_installed:
        print("embed-toolkit: Already installed.")
        print("  Use --force to reinstall, or --uninstall to remove.\n")
        show_status(targets)
        return

    if partial_installed:
        print("embed-toolkit: Installing missing skills...\n")
    else:
        print("embed-toolkit installer")
    print(f"  Source: {SRC_DIR}\n")

    for t in targets:
        install_to_target(t)
        print()

    print("embed-toolkit installed successfully!\n")
    print("Available skills:")
    for name in SKILL_NAMES:
        print(f"  /{name}")


def force_install(targets):
    """Remove old installation and reinstall to all targets."""
    print("  Removing previous installation...\n")
    for t in targets:
        if t.get("type") == "opencode":
            command_dir = t.get("command_dir")
            if command_dir and command_dir.exists():
                for name in SKILL_NAMES:
                    cmd_file = command_dir / f"{name}.md"
                    if cmd_file.exists():
                        cmd_file.unlink()
        for name in SKILL_NAMES:
            remove_dir(t["skills_dir"] / name)
        remove_dir(t["shared_dir"])
    print("  Removed previous installation.\n")
    install(targets)


def uninstall(targets):
    """Remove all skills and shared dirs from all targets."""
    total_removed = 0

    for t in targets:
        removed = 0

        if t.get("type") == "opencode":
            # Remove command/embed-*.md files
            command_dir = t.get("command_dir")
            if command_dir and command_dir.exists():
                for name in SKILL_NAMES:
                    cmd_file = command_dir / f"{name}.md"
                    if cmd_file.exists():
                        cmd_file.unlink()
                        removed += 1
            # Remove shared dir under skills/embed-toolkit/
            if t["shared_dir"].exists():
                remove_dir(t["shared_dir"])
                removed += 1
        else:
            for name in SKILL_NAMES:
                d = t["skills_dir"] / name
                if d.exists():
                    remove_dir(d)
                    removed += 1

            if t["shared_dir"].exists():
                remove_dir(t["shared_dir"])
                removed += 1

        if removed > 0:
            print(f"  {t['name']}: removed {removed} items")
            total_removed += removed

    if total_removed == 0:
        print("embed-toolkit is not installed.")
    else:
        print(f"\nembed-toolkit uninstalled ({total_removed} items removed).")


# --- Main ---

def parse_args():
    """Parse command line arguments."""
    args = sys.argv[1:]
    flags = {
        "uninstall": False,
        "status": False,
        "force": False,
        "targets": None,  # None = auto-detect
        "tool": None,     # None = all tools
    }

    i = 0
    while i < len(args):
        if args[i] == "--uninstall":
            flags["uninstall"] = True
        elif args[i] == "--status":
            flags["status"] = True
        elif args[i] == "--force":
            flags["force"] = True
        elif args[i] == "--tool" and i + 1 < len(args):
            if args[i + 1].startswith("--"):
                print("ERROR: --tool requires a tool name (claude, opencode, generic)", file=sys.stderr)
                sys.exit(1)
            flags["tool"] = args[i + 1]
            i += 1
        elif args[i] == "--target" and i + 1 < len(args):
            if args[i + 1].startswith("--"):
                print("ERROR: --target requires a directory path", file=sys.stderr)
                sys.exit(1)
            target_path = Path(args[i + 1]).resolve()
            flags["targets"] = [make_target(target_path)]
            i += 1
        i += 1

    return flags


def main():
    flags = parse_args()
    targets = flags["targets"] if flags["targets"] is not None else get_default_targets()

    # Filter by tool type if --tool is specified
    if flags["tool"]:
        requested = set(t.strip() for t in flags["tool"].lower().split(","))
        targets = [t for t in targets if t.get("type") in requested]
        if not targets:
            print(f"ERROR: No targets match --tool {flags['tool']}", file=sys.stderr)
            print("  Valid tools: claude, opencode, generic", file=sys.stderr)
            sys.exit(1)

    if not targets:
        print("embed-toolkit: No installation targets found.")
        print("  Use --target <path> to specify a skills directory.")
        sys.exit(1)

    print(f"Install targets: {', '.join(t['name'] for t in targets)}\n")

    if flags["uninstall"]:
        uninstall(targets)
    elif flags["status"]:
        show_status(targets)
    elif flags["force"]:
        force_install(targets)
    else:
        install(targets)


if __name__ == "__main__":
    main()
