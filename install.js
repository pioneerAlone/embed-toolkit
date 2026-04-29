#!/usr/bin/env node

/**
 * embed-toolkit installer
 *
 * Copies skills to ~/.claude/skills/embed-toolkit/ so Claude Code
 * can discover and use them.
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

const INSTALL_DIR = path.join(os.homedir(), ".claude", "skills", "embed-toolkit");

// Determine source directory (where the toolkit files live)
const SRC_DIR = __dirname;

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
  if (!fs.existsSync(INSTALL_DIR)) {
    console.log("embed-toolkit: NOT INSTALLED");
    console.log(`  Expected at: ${INSTALL_DIR}`);
    return false;
  }
  const skills = fs.readdirSync(path.join(INSTALL_DIR, "skills"));
  console.log("embed-toolkit: INSTALLED");
  console.log(`  Location: ${INSTALL_DIR}`);
  console.log(`  Skills (${skills.length}):`);
  for (const s of skills) {
    console.log(`    - ${s}`);
  }
  return true;
}

function install() {
  if (fs.existsSync(INSTALL_DIR)) {
    console.log(`embed-toolkit: Already installed at ${INSTALL_DIR}`);
    console.log("  Use --force to reinstall, or --uninstall to remove.");
    return;
  }

  console.log("embed-toolkit installer");
  console.log(`  Source: ${SRC_DIR}`);
  console.log(`  Target: ${INSTALL_DIR}`);

  // Copy shared/
  const sharedSrc = path.join(SRC_DIR, "shared");
  const sharedDest = path.join(INSTALL_DIR, "shared");
  if (fs.existsSync(sharedSrc)) {
    copyDir(sharedSrc, sharedDest);
    console.log("  ✓ shared/");
  }

  // Copy skills/
  const skillsSrc = path.join(SRC_DIR, "skills");
  const skillsDest = path.join(INSTALL_DIR, "skills");
  if (fs.existsSync(skillsSrc)) {
    copyDir(skillsSrc, skillsDest);
    const skillNames = fs.readdirSync(skillsSrc);
    for (const s of skillNames) {
      console.log(`  ✓ skills/${s}/SKILL.md`);
    }
  }

  // Copy templates/
  const tmplSrc = path.join(SRC_DIR, "templates");
  const tmplDest = path.join(INSTALL_DIR, "templates");
  if (fs.existsSync(tmplSrc)) {
    copyDir(tmplSrc, tmplDest);
    console.log("  ✓ templates/");
  }

  console.log("");
  console.log("embed-toolkit installed successfully!");
  console.log(`  ${INSTALL_DIR}`);
  console.log("");
  console.log("Available skills:");
  const skillDirs = fs.readdirSync(skillsDest);
  for (const s of skillDirs) {
    console.log(`  /${s}`);
  }
}

function forceInstall() {
  if (fs.existsSync(INSTALL_DIR)) {
    removeDir(INSTALL_DIR);
    console.log("  Removed previous installation.");
  }
  install();
}

// --- Main ---
const args = process.argv.slice(2);

if (args.includes("--uninstall")) {
  if (fs.existsSync(INSTALL_DIR)) {
    removeDir(INSTALL_DIR);
    console.log("embed-toolkit uninstalled.");
  } else {
    console.log("embed-toolkit is not installed.");
  }
} else if (args.includes("--status")) {
  status();
} else if (args.includes("--force")) {
  forceInstall();
} else {
  install();
}
