#!/usr/bin/env bash
# embed-toolkit installer — pure bash, zero dependencies
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/pioneerAlone/embed-toolkit/main/install.sh | bash
#   bash install.sh                  # from local clone
#   bash install.sh --status         # check installation status
#   bash install.sh --force          # force reinstall
#   bash install.sh --uninstall      # remove from all targets
#   bash install.sh --target <dir>   # install to specific directory
#   bash install.sh --tool claude     # install only to Claude Code
#   bash install.sh --tool opencode   # install only to OpenCode
set -euo pipefail

REPO_OWNER="pioneerAlone"
REPO_NAME="embed-toolkit"
REPO_BRANCH="main"

SKILL_NAMES=(
  "embed-build" "embed-flash" "embed-serial" "embed-debug"
  "embed-diag" "embed-workflow" "embed-setup" "embed-test"
  "embed-memory" "embed-crash" "embed-static"
)

# --- Parse args ---
UNINSTALL=false; STATUS=false; FORCE=false; TARGET_DIR=""; TOOL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=true ;;
    --status)    STATUS=true ;;
    --force)     FORCE=true ;;
    --tool)
      if [[ -z "${2:-}" || "$2" == --* ]]; then
        echo "ERROR: --tool requires a tool name (claude, opencode, generic)" >&2
        exit 1
      fi
      TOOL="$2"; shift ;;
    --target)
      if [[ -z "${2:-}" || "$2" == --* ]]; then
        echo "ERROR: --target requires a directory path" >&2
        exit 1
      fi
      TARGET_DIR="$2"; shift ;;
  esac
  shift
done

# --- Resolve source directory ---
# If run from a local clone, use the repo root. Otherwise download from GitHub.
resolve_src() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Check if we're in a repo clone (skills/ directory exists alongside this script)
  if [[ -d "$script_dir/skills/embed-build" ]]; then
    echo "$script_dir"
    return
  fi

  # Download from GitHub
  local tmpdir
  tmpdir="$(mktemp -d)"
  local tarball="$tmpdir/${REPO_NAME}.tar.gz"
  local url="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz"

  echo "  Downloading embed-toolkit from GitHub..." >&2
  if command -v curl &>/dev/null; then
    curl -fsSL "$url" -o "$tarball"
  elif command -v wget &>/dev/null; then
    wget -q "$url" -O "$tarball"
  else
    echo "ERROR: Neither curl nor wget found. Install one or run from a local clone." >&2
    exit 1
  fi

  tar -xzf "$tarball" -C "$tmpdir"
  echo "${tmpdir}/${REPO_NAME}-${REPO_BRANCH}"
}

# Cleanup temp download directory on exit
_EMBED_TMPDIR=""
cleanup() {
  if [[ -n "${_EMBED_TMPDIR:-}" ]] && [[ -d "$_EMBED_TMPDIR" ]]; then
    rm -rf "$_EMBED_TMPDIR"
  fi
}
trap cleanup EXIT

SRC_DIR="$(resolve_src)"

# --- Target discovery ---
get_targets() {
  local home="${HOME}"
  local targets=()

  if [[ -n "$TARGET_DIR" ]]; then
    targets+=("custom|$TARGET_DIR|$TARGET_DIR/embed-toolkit|custom")
    printf '%s\n' "${targets[@]}"
    return
  fi

  # Claude Code (always)
  targets+=("Claude Code|$home/.claude/skills|$home/.claude/skills/embed-toolkit|claude")

  # OpenCode (if config dir exists)
  if [[ -d "$home/.config/opencode" ]]; then
    targets+=("OpenCode|$home/.config/opencode/skills|$home/.config/opencode/skills/embed-toolkit|opencode")
  fi

  # Generic Agents (if config dir exists)
  if [[ -d "$home/.agents" ]]; then
    targets+=("Generic Agents|$home/.agents/skills|$home/.agents/skills/embed-toolkit|generic")
  fi

  printf '%s\n' "${targets[@]}"
}

all_targets() {
  get_targets | filter_by_tool
}

filter_by_tool() {
  if [[ -z "$TOOL" ]]; then
    cat
  else
    local IFS=','
    local tools
    read -ra tools <<< "$TOOL"
    while IFS='|' read -r line; do
      local ttype="${line##*|}"
      for tool in "${tools[@]}"; do
        if [[ "$ttype" == "$tool" ]]; then
          echo "$line"
          break
        fi
      done
    done
  fi
}

# --- Helpers ---
skill_file_for() {
  local target_type="$1" target_skills_dir="$2" name="$3"
  if [[ "$target_type" == "opencode" ]]; then
    # OpenCode: flat .md in command/ dir
    local config_dir
    config_dir="$(dirname "$target_skills_dir")"
    echo "$config_dir/command/${name}.md"
  else
    echo "$target_skills_dir/$name/SKILL.md"
  fi
}

# --- Operations ---
check_status() {
  local any_installed=false
  while IFS='|' read -r name skills_dir shared_dir type; do
    local installed=0
    for skill in "${SKILL_NAMES[@]}"; do
      local path
      path="$(skill_file_for "$type" "$skills_dir" "$skill")"
      if [[ -f "$path" ]]; then
        ((installed++))
      fi
    done
    if [[ "$installed" -gt 0 ]]; then
      any_installed=true
      echo "embed-toolkit @ $name ($skills_dir)"
      echo "  Skills: $installed/${#SKILL_NAMES[@]}"
      for skill in "${SKILL_NAMES[@]}"; do
        local path
        path="$(skill_file_for "$type" "$skills_dir" "$skill")"
        if [[ -f "$path" ]]; then
          echo "    ✓ $skill"
        else
          echo "    ✗ $skill (missing)"
        fi
      done
      if [[ -d "$shared_dir" ]]; then
        echo "  shared: $shared_dir"
      fi
      echo ""
    fi
  done < <(all_targets)

  if ! $any_installed; then
    echo "embed-toolkit: NOT INSTALLED"
  fi
}

do_install() {
  local already=false
  while IFS='|' read -r name skills_dir shared_dir type; do
    for skill in "${SKILL_NAMES[@]}"; do
      local path
      path="$(skill_file_for "$type" "$skills_dir" "$skill")"
      if [[ -f "$path" ]]; then
        already=true; break 2
      fi
    done
  done < <(all_targets)

  if $FORCE; then
    echo "  Removing previous installation..."
  fi

  if $already && ! $FORCE; then
    echo "embed-toolkit: Already installed."
    echo "  Use --force to reinstall, or --uninstall to remove."
    echo ""
    check_status
    return
  fi

  echo "embed-toolkit installer"
  echo "  Source: $SRC_DIR"
  echo ""

  while IFS='|' read -r name skills_dir shared_dir type; do
    echo "→ $name ($skills_dir)"
    mkdir -p "$skills_dir"

    if [[ "$type" == "opencode" ]]; then
      # OpenCode: flat .md files in command/
      local cmd_dir
      cmd_dir="$(dirname "$skills_dir")/command"
      mkdir -p "$cmd_dir"
      for skill in "${SKILL_NAMES[@]}"; do
        local src="$SRC_DIR/skills/$skill/SKILL.md"
        local dest="$cmd_dir/${skill}.md"
        if [[ -f "$src" ]]; then
          # Strip 'name:' and 'model:' lines only within YAML frontmatter
          sed '/^---$/,/^---$/ { /^name:/d; /^model:/d }' "$src" > "$dest"
          # Convert path references for OpenCode
          if command -v gsed &>/dev/null; then
            gsed -i 's|~/.claude/skills/embed-toolkit|~/.config/opencode/skills/embed-toolkit|g' "$dest"
            gsed -i 's|\$HOME/.claude/skills/embed-toolkit|$HOME/.config/opencode/skills/embed-toolkit|g' "$dest"
          else
            sed -i '' 's|~/.claude/skills/embed-toolkit|~/.config/opencode/skills/embed-toolkit|g' "$dest"
            sed -i '' 's|\$HOME/.claude/skills/embed-toolkit|$HOME/.config/opencode/skills/embed-toolkit|g' "$dest"
          fi
          echo "  ✓ $skill"
        else
          echo "  ✗ $skill (source not found)"
        fi
      done
    else
      # Claude Code / Generic / Custom: copy directories
      for skill in "${SKILL_NAMES[@]}"; do
        local src="$SRC_DIR/skills/$skill"
        local dest="$skills_dir/$skill"
        if [[ -d "$src" ]]; then
          rm -rf "$dest"
          cp -R "$src" "$dest"
          echo "  ✓ $skill"
        else
          echo "  ✗ $skill (source not found)"
        fi
      done
    fi

    # shared/
    local shared_src="$SRC_DIR/shared"
    local shared_dest="$shared_dir/shared"
    if [[ -d "$shared_src" ]]; then
      rm -rf "$shared_dest"
      mkdir -p "$shared_dir"
      cp -R "$shared_src" "$shared_dest"
      echo "  ✓ shared/"
    fi

    # templates/
    local tmpl_src="$SRC_DIR/templates"
    local tmpl_dest="$shared_dir/templates"
    if [[ -d "$tmpl_src" ]]; then
      rm -rf "$tmpl_dest"
      mkdir -p "$shared_dir"
      cp -R "$tmpl_src" "$tmpl_dest"
      echo "  ✓ templates/"
    fi
    echo ""
  done < <(all_targets)

  echo "embed-toolkit installed successfully!"
  echo ""
  echo "Available skills:"
  for skill in "${SKILL_NAMES[@]}"; do
    echo "  /$skill"
  done
}

do_uninstall() {
  local total=0
  while IFS='|' read -r name skills_dir shared_dir type; do
    local removed=0

    if [[ "$type" == "opencode" ]]; then
      local cmd_dir
      cmd_dir="$(dirname "$skills_dir")/command"
      for skill in "${SKILL_NAMES[@]}"; do
        local f="$cmd_dir/${skill}.md"
        if [[ -f "$f" ]]; then
          rm -f "$f"
          ((removed++))
        fi
      done
    else
      for skill in "${SKILL_NAMES[@]}"; do
        local d="$skills_dir/$skill"
        if [[ -d "$d" ]]; then
          rm -rf "$d"
          ((removed++))
        fi
      done
    fi

    if [[ -d "$shared_dir" ]]; then
      rm -rf "$shared_dir"
      ((removed++))
    fi

    if [[ "$removed" -gt 0 ]]; then
      echo "  $name: removed $removed items"
      ((total += removed))
    fi
  done < <(all_targets)

  if [[ "$total" -eq 0 ]]; then
    echo "embed-toolkit is not installed."
  else
    echo ""
    echo "embed-toolkit uninstalled ($total items removed)."
  fi
}

# --- Main ---
target_names=()
while IFS='|' read -r name _; do target_names+=("$name"); done < <(all_targets)
if [[ ${#target_names[@]} -eq 0 ]]; then
  echo "ERROR: No targets match --tool $TOOL" >&2
  echo "  Valid tools: claude, opencode, generic" >&2
  exit 1
fi
echo "Install targets: $(IFS=', '; echo "${target_names[*]}")"
echo ""

if $UNINSTALL; then
  do_uninstall
elif $STATUS; then
  check_status
else
  do_install
fi
