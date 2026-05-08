#!/usr/bin/env node

/**
 * embed-toolkit installer
 *
 * Installs each skill as a flat directory under ~/.claude/skills/
 * so Claude Code can discover them (it scans one level deep for SKILL.md).
 *
 * Shared files go to ~/.claude/skills/embed-toolkit/shared/.
 *
 * Usage:
 *   npx embed-toolkit              # install from npm
 *   npx github:user/embed-toolkit  # install directly from GitHub
 *   node install.js                # install from local clone
 *   node install.js --uninstall    # remove installed skills
 *   node install.js --status       # check installation status
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const SHARED_DIR = path.join(SKILLS_DIR, "embed-toolkit");
const SRC_DIR = __dirname;

const SKILL_NAMES = [
  "embed-build",
  "embed-flash",
  "embed-serial",
  "embed-debug",
  "embed-diag",
  "embed-workflow",
];

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
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function status() {
  const installed = [];
  const missing = [];
  for (const name of SKILL_NAMES) {
    const skillPath = path.join(SKILLS_DIR, name, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      installed.push(name);
    } else {
      missing.push(name);
    }
  }

  if (installed.length === 0) {
    console.log("embed-toolkit: NOT INSTALLED");
    return false;
  }

  console.log("embed-toolkit: INSTALLED");
  console.log(`  Skills: ${installed.length}/${SKILL_NAMES.length}`);
  for (const s of installed) {
    console.log(`    ✓ ${s}`);
  }
  if (missing.length > 0) {
    for (const s of missing) {
      console.log(`    ✗ ${s} (missing)`);
    }
  }
  if (fs.existsSync(SHARED_DIR)) {
    console.log(`  shared: ${SHARED_DIR}`);
  }
  return true;
}

function install() {
  // Check if already installed
  const alreadyInstalled = SKILL_NAMES.some((name) =>
    fs.existsSync(path.join(SKILLS_DIR, name, "SKILL.md"))
  );
  if (alreadyInstalled) {
    console.log("embed-toolkit: Already installed.");
    console.log("  Use --force to reinstall, or --uninstall to remove.");
    status();
    return;
  }

  console.log("embed-toolkit installer");
  console.log(`  Source: ${SRC_DIR}`);

  // Install each skill as a flat directory: ~/.claude/skills/embed-build/SKILL.md
  const skillsSrc = path.join(SRC_DIR, "skills");
  if (fs.existsSync(skillsSrc)) {
    for (const name of SKILL_NAMES) {
      const src = path.join(skillsSrc, name);
      const dest = path.join(SKILLS_DIR, name);
      if (fs.existsSync(src)) {
        removeDir(dest);
        copyDir(src, dest);
        console.log(`  ✓ ${name}`);
      } else {
        console.log(`  ✗ ${name} (source not found)`);
      }
    }
  }

  // Install shared/ to ~/.claude/skills/embed-toolkit/shared/
  const sharedSrc = path.join(SRC_DIR, "shared");
  const sharedDest = path.join(SHARED_DIR, "shared");
  if (fs.existsSync(sharedSrc)) {
    removeDir(sharedDest);
    copyDir(sharedSrc, sharedDest);
    console.log(`  ✓ embed-toolkit/shared/`);
  }

  // Install templates/ to ~/.claude/skills/embed-toolkit/templates/
  const tmplSrc = path.join(SRC_DIR, "templates");
  const tmplDest = path.join(SHARED_DIR, "templates");
  if (fs.existsSync(tmplSrc)) {
    removeDir(tmplDest);
    copyDir(tmplSrc, tmplDest);
    console.log(`  ✓ embed-toolkit/templates/`);
  }

  console.log("");
  console.log("embed-toolkit installed successfully!");
  console.log("");
  console.log("Available skills:");
  for (const name of SKILL_NAMES) {
    console.log(`  /${name}`);
  }
}

function forceInstall() {
  // Remove old style install if present
  removeDir(path.join(SKILLS_DIR, "embed-toolkit", "skills"));
  // Remove each skill
  for (const name of SKILL_NAMES) {
    removeDir(path.join(SKILLS_DIR, name));
  }
  console.log("  Removed previous installation.");
  install();
}

function uninstall() {
  let removed = 0;
  for (const name of SKILL_NAMES) {
    const dir = path.join(SKILLS_DIR, name);
    if (fs.existsSync(dir)) {
      removeDir(dir);
      console.log(`  ✓ removed ${name}`);
      removed++;
    }
  }
  // Also remove shared if it exists
  if (fs.existsSync(SHARED_DIR)) {
    removeDir(SHARED_DIR);
    console.log(`  ✓ removed embed-toolkit/shared`);
    removed++;
  }
  if (removed === 0) {
    console.log("embed-toolkit is not installed.");
  } else {
    console.log("");
    console.log("embed-toolkit uninstalled.");
  }
}

// --- Main ---
const args = process.argv.slice(2);

if (args.includes("--uninstall")) {
  uninstall();
} else if (args.includes("--status")) {
  status();
} else if (args.includes("--force")) {
  forceInstall();
} else {
  install();
}
