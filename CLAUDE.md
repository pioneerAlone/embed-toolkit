# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project summary

embed-toolkit is a Claude Code skill pack for embedded firmware development. It provides 8 skills (`embed-build`, `embed-flash`, `embed-serial`, `embed-debug`, `embed-diag`, `embed-workflow`, `embed-setup`, `embed-test`) that auto-detect the host toolchain and MCU platform, then execute the right commands.

The skills are installed as flat directories under `~/.claude/skills/`, one per skill, each containing a `SKILL.md`. Claude Code discovers them by scanning one level deep.

## Commands

```bash
node install.js              # install skills to ~/.claude/skills/
node install.js --status     # check installation status
node install.js --force      # force reinstall
node install.js --uninstall  # remove installed skills
```

The detection engine can be run standalone:
```bash
node shared/embed_detect.js [workspace_path]  # outputs JSON Project Profile to stdout
```

There is no test suite or build step. `npm publish` would ship `install.js`, `shared/`, `skills/`, `templates/`, and `README.md` (see `package.json` `files` field).

## Architecture

### Skill format

Each skill is a self-contained directory with a `SKILL.md` that follows a fixed structure defined in `templates/SKILL.template.md`:
- **When to Use** — trigger phrases and contexts
- **Required Inputs** — minimum inputs, which can be filled by auto-detection
- **Auto-Detection** — priority chain: user input > `.embed.json` > auto-detect > block and ask
- **Steps** — modes (if multi-mode), execution flow, command tables
- **Failure Triage** — scenario → category mapping (categories from `shared/failure-taxonomy.md`)
- **Platform Notes** — OS-specific differences that affect this skill
- **Output Contract** — structured YAML: status, summary, evidence, next_action
- **Handoff** — which downstream skill to invoke on success/failure

### Shared modules (`shared/`)

- **`failure-taxonomy.md`** — 7 standard failure categories used by all skills: `environment-missing`, `project-config-error`, `connection-failure`, `artifact-missing`, `target-response-abnormal`, `permission-problem`, `ambiguous-context`
- **`contracts.md`** — Project Profile schema (20+ fields), action verbs, decision rules (ELF > HEX > BIN; never guess BIN base address), skill handoff contract, outcome schema
- **`platform-notes.md`** — centralized OS detection, path rules, serial port naming, permissions, tool priority, temp file conventions
- **`embed_detect.js`** — zero-dependency Node.js script that scans a workspace and outputs a JSON Project Profile (build system, MCU, RTOS, probes, serial ports, artifacts)

### Project Profile

The Project Profile is the shared state that flows across skills. It starts from `embed_detect.js` auto-detection results and is enriched by each skill as it runs. Per-project overrides come from `.embed.json` in the project root (not yet implemented in the detection script).

### Installers

Two functionally identical installers (`install.js` Node, `install.py` Python) copy each skill directory to `~/.claude/skills/<skill-name>/` and shared files to `~/.claude/skills/embed-toolkit/shared/`.

## Key conventions

- Skill output always includes: `status` (success/partial_success/blocked/failure), `summary`, `evidence`, `next_action`, and `failure_category` on non-success
- Never guess a BIN file's flash base address — block and ask the user
- Prefer ELF over HEX over BIN for artifacts (ELF has debug symbols)
- Detection priority is always: user input > `.embed.json` > auto-detect > block and ask
- When writing new skills, use `templates/SKILL.template.md` as the starting point and reference the shared taxonomy/contracts
