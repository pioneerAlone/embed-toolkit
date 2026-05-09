#!/usr/bin/env node

/**
 * embed-toolkit installer
 *
 * Installs each skill as a flat directory under skill discovery paths
 * for Claude Code and OpenCode (auto-detected).
 *
 * Skill discovery paths:
 *   - Claude Code:  ~/.claude/skills/<name>/SKILL.md
 *   - OpenCode:     ~/.config/opencode/skills/<name>/SKILL.md
 *   - Generic:      ~/.agents/skills/<name>/SKILL.md
 *
 * Shared files go to <target>/embed-toolkit/{shared,templates}/.
 *
 * Usage:
 *   node install.js                  # install to all detected targets
 *   node install.js --tool claude    # install only to Claude Code
 *   node install.js --tool opencode  # install only to OpenCode
 *   node install.js --target <dir>   # install to specific directory
 *   node install.js --status         # check installation status
 *   node install.js --force          # force reinstall
 *   node install.js --uninstall      # remove from all targets
 *
 * See also: install.sh (bash, zero-dependency), install.py (Python)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SRC_DIR = __dirname;

const SKILL_NAMES = [
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
];

// --- Target discovery ---

function getDefaultTargets() {
  const home = os.homedir();
  const targets = [];

  // Claude Code — always include (also serves as OpenCode fallback)
  targets.push({
    name: "Claude Code",
    type: "claude",
    skillsDir: path.join(home, ".claude", "skills"),
    sharedDir: path.join(home, ".claude", "skills", "embed-toolkit"),
  });

  // OpenCode — include if its config directory exists
  // OpenCode discovers slash commands from command/*.md (flat files), not skills/<name>/SKILL.md
  const opencodeConfig = path.join(home, ".config", "opencode");
  if (fs.existsSync(opencodeConfig)) {
    targets.push({
      name: "OpenCode",
      type: "opencode",
      skillsDir: path.join(opencodeConfig, "skills"),
      sharedDir: path.join(opencodeConfig, "skills", "embed-toolkit"),
      commandDir: path.join(opencodeConfig, "command"),
    });
  }

  // Generic agents path — include if exists
  const agentsDir = path.join(home, ".agents");
  if (fs.existsSync(agentsDir)) {
    targets.push({
      name: "Generic Agents",
      type: "generic",
      skillsDir: path.join(agentsDir, "skills"),
      sharedDir: path.join(agentsDir, "skills", "embed-toolkit"),
    });
  }

  return targets;
}

function makeTarget(skillsDir) {
  return {
    name: path.basename(skillsDir),
    type: "custom",
    skillsDir: skillsDir,
    sharedDir: path.join(skillsDir, "embed-toolkit"),
  };
}

// --- Helpers ---

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- Operations (work on an array of targets) ---

function checkTargetStatus(target) {
  const installed = [];
  const missing = [];
  const isOpencode = target.type === "opencode";
  for (const name of SKILL_NAMES) {
    const checkPath = isOpencode
      ? path.join(target.commandDir, `${name}.md`)
      : path.join(target.skillsDir, name, "SKILL.md");
    if (fs.existsSync(checkPath)) {
      installed.push(name);
    } else {
      missing.push(name);
    }
  }
  return { target, installed, missing };
}

function status(targets) {
  let anyInstalled = false;

  for (const t of targets) {
    const s = checkTargetStatus(t);
    if (s.installed.length === 0) continue;
    anyInstalled = true;
    console.log(`embed-toolkit @ ${t.name} (${t.skillsDir})`);
    console.log(`  Skills: ${s.installed.length}/${SKILL_NAMES.length}`);
    for (const name of s.installed) {
      console.log(`    ✓ ${name}`);
    }
    for (const name of s.missing) {
      console.log(`    ✗ ${name} (missing)`);
    }
    if (fs.existsSync(t.sharedDir)) {
      console.log(`  shared: ${t.sharedDir}`);
    }
    console.log("");
  }

  if (!anyInstalled) {
    console.log("embed-toolkit: NOT INSTALLED");
    for (const t of targets) {
      console.log(`  checked: ${t.name} (${t.skillsDir})`);
    }
    return false;
  }
  return true;
}

function convertToOpencodeCommand(content) {
  // Convert Claude Code skill frontmatter to OpenCode command format.
  // OpenCode uses filename for command name, so strip the 'name:' field.
  // Keep 'description:', strip 'model:'.
  const lines = content.split("\n");
  const result = [];
  let inFrontmatter = false;
  let frontmatterEnded = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        result.push(line);
        continue;
      } else if (!frontmatterEnded) {
        frontmatterEnded = true;
        inFrontmatter = false;
        result.push(line);
        continue;
      }
    }
    if (inFrontmatter && !frontmatterEnded) {
      const trimmed = line.trim();
      if (trimmed.startsWith("name:")) continue;
      if (trimmed.startsWith("model:")) continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

function installToTarget(target) {
  console.log(`→ ${target.name} (${target.skillsDir})`);

  if (target.type === "opencode") {
    // OpenCode: deploy flat .md files to command/ directory
    fs.mkdirSync(target.commandDir, { recursive: true });

    const skillsSrc = path.join(SRC_DIR, "skills");
    if (fs.existsSync(skillsSrc)) {
      for (const name of SKILL_NAMES) {
        const srcSkillMd = path.join(skillsSrc, name, "SKILL.md");
        const destPath = path.join(target.commandDir, `${name}.md`);
        if (fs.existsSync(srcSkillMd)) {
          let content = fs.readFileSync(srcSkillMd, "utf8");
          content = convertToOpencodeCommand(content);
          // Convert path references: Claude Code paths → OpenCode paths
          content = content.replace(/~\/\.claude\/skills\/embed-toolkit/g, "~/.config/opencode/skills/embed-toolkit");
          content = content.replace(/\$HOME\/\.claude\/skills\/embed-toolkit/g, "$HOME/.config/opencode/skills/embed-toolkit");
          fs.writeFileSync(destPath, content);
          console.log(`  ✓ ${name}`);
        } else {
          console.log(`  ✗ ${name} (source not found)`);
        }
      }
    }

    // Still install shared/ and templates/ (referenced by command files)
    const sharedSrc = path.join(SRC_DIR, "shared");
    const sharedDest = path.join(target.sharedDir, "shared");
    if (fs.existsSync(sharedSrc)) {
      removeDir(sharedDest);
      copyDir(sharedSrc, sharedDest);
      console.log("  ✓ shared/");
    }

    const tmplSrc = path.join(SRC_DIR, "templates");
    const tmplDest = path.join(target.sharedDir, "templates");
    if (fs.existsSync(tmplSrc)) {
      removeDir(tmplDest);
      copyDir(tmplSrc, tmplDest);
      console.log("  ✓ templates/");
    }
    return;
  }

  // Claude Code / Generic / Custom: deploy skill directories to skills/<name>/SKILL.md
  const skillsSrc = path.join(SRC_DIR, "skills");
  if (fs.existsSync(skillsSrc)) {
    for (const name of SKILL_NAMES) {
      const src = path.join(skillsSrc, name);
      const dest = path.join(target.skillsDir, name);
      if (fs.existsSync(src)) {
        removeDir(dest);
        copyDir(src, dest);
        console.log(`  ✓ ${name}`);
      } else {
        console.log(`  ✗ ${name} (source not found)`);
      }
    }
  }

  // Install shared/
  const sharedSrc = path.join(SRC_DIR, "shared");
  const sharedDest = path.join(target.sharedDir, "shared");
  if (fs.existsSync(sharedSrc)) {
    removeDir(sharedDest);
    copyDir(sharedSrc, sharedDest);
    console.log(`  ✓ shared/`);
  }

  // Install templates/
  const tmplSrc = path.join(SRC_DIR, "templates");
  const tmplDest = path.join(target.sharedDir, "templates");
  if (fs.existsSync(tmplSrc)) {
    removeDir(tmplDest);
    copyDir(tmplSrc, tmplDest);
    console.log(`  ✓ templates/`);
  }
}

function install(targets) {
  // Check if already installed on ANY target
  let alreadyInstalled = false;
  for (const t of targets) {
    const s = checkTargetStatus(t);
    if (s.installed.length > 0) {
      alreadyInstalled = true;
      break;
    }
  }

  if (alreadyInstalled) {
    console.log("embed-toolkit: Already installed.");
    console.log("  Use --force to reinstall, or --uninstall to remove.\n");
    status(targets);
    return;
  }

  console.log("embed-toolkit installer");
  console.log(`  Source: ${SRC_DIR}\n`);

  for (const t of targets) {
    installToTarget(t);
    console.log("");
  }

  console.log("embed-toolkit installed successfully!\n");
  console.log("Available skills:");
  for (const name of SKILL_NAMES) {
    console.log(`  /${name}`);
  }
}

function forceInstall(targets) {
  console.log("  Removing previous installation...\n");
  for (const t of targets) {
    if (t.type === "opencode") {
      if (t.commandDir && fs.existsSync(t.commandDir)) {
        for (const name of SKILL_NAMES) {
          const cmdFile = path.join(t.commandDir, `${name}.md`);
          if (fs.existsSync(cmdFile)) fs.unlinkSync(cmdFile);
        }
      }
    }
    for (const name of SKILL_NAMES) {
      removeDir(path.join(t.skillsDir, name));
    }
    removeDir(t.sharedDir);
  }
  console.log("  Removed previous installation.\n");
  install(targets);
}

function uninstall(targets) {
  let totalRemoved = 0;

  for (const t of targets) {
    let removed = 0;

    if (t.type === "opencode") {
      // Remove command/embed-*.md files
      if (t.commandDir && fs.existsSync(t.commandDir)) {
        for (const name of SKILL_NAMES) {
          const cmdFile = path.join(t.commandDir, `${name}.md`);
          if (fs.existsSync(cmdFile)) {
            fs.unlinkSync(cmdFile);
            removed++;
          }
        }
      }
      // Remove shared dir under skills/embed-toolkit/
      if (fs.existsSync(t.sharedDir)) {
        removeDir(t.sharedDir);
        removed++;
      }
    } else {
      for (const name of SKILL_NAMES) {
        const dir = path.join(t.skillsDir, name);
        if (fs.existsSync(dir)) {
          removeDir(dir);
          removed++;
        }
      }
      if (fs.existsSync(t.sharedDir)) {
        removeDir(t.sharedDir);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`  ${t.name}: removed ${removed} items`);
      totalRemoved += removed;
    }
  }

  if (totalRemoved === 0) {
    console.log("embed-toolkit is not installed.");
  } else {
    console.log(`\nembed-toolkit uninstalled (${totalRemoved} items removed).`);
  }
}

// --- Main ---

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    uninstall: false,
    status: false,
    force: false,
    targets: null, // null = auto-detect
    tool: null,    // null = all tools
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--uninstall") {
      flags.uninstall = true;
    } else if (args[i] === "--status") {
      flags.status = true;
    } else if (args[i] === "--force") {
      flags.force = true;
    } else if (args[i] === "--tool" && i + 1 < args.length) {
      if (args[i + 1].startsWith("--")) {
        console.error("ERROR: --tool requires a tool name (claude, opencode, generic)");
        process.exit(1);
      }
      flags.tool = args[++i];
    } else if (args[i] === "--target" && i + 1 < args.length) {
      if (args[i + 1].startsWith("--")) {
        console.error("ERROR: --target requires a directory path");
        process.exit(1);
      }
      const targetPath = path.resolve(args[++i]);
      flags.targets = [makeTarget(targetPath)];
    }
  }

  return flags;
}

function main() {
  const flags = parseArgs();
  let targets = flags.targets || getDefaultTargets();

  // Filter by tool type if --tool is specified
  if (flags.tool) {
    const requested = flags.tool.toLowerCase().split(",").map(s => s.trim());
    targets = targets.filter(t => requested.includes(t.type));
    if (targets.length === 0) {
      console.error(`ERROR: No targets match --tool ${flags.tool}`);
      console.error("  Valid tools: claude, opencode, generic");
      process.exit(1);
    }
  }

  if (targets.length === 0) {
    console.log("embed-toolkit: No installation targets found.");
    console.log("  Use --target <path> to specify a skills directory.");
    process.exit(1);
  }

  console.log(`Install targets: ${targets.map((t) => t.name).join(", ")}\n`);

  if (flags.uninstall) {
    uninstall(targets);
  } else if (flags.status) {
    status(targets);
  } else if (flags.force) {
    forceInstall(targets);
  } else {
    install(targets);
  }
}

main();
