const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

const INSTALL_JS = path.join(__dirname, "..", "install.js");

describe("installer", () => {
  let tempHome;
  let claudeSkills;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "embed_test_home_"));
    claudeSkills = path.join(tempHome, ".claude", "skills");
    fs.mkdirSync(claudeSkills, { recursive: true });
  });

  after(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function runInstall(...args) {
    return execSync(
      `HOME=${tempHome} node "${INSTALL_JS}" ${args.join(" ")}`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  }

  function skillExists(name) {
    return fs.existsSync(path.join(claudeSkills, name, "SKILL.md"));
  }

  it("fresh install creates all 8 skills", () => {
    runInstall();
    for (const name of [
      "embed-build", "embed-flash", "embed-serial", "embed-debug",
      "embed-diag", "embed-workflow", "embed-setup", "embed-test",
    ]) {
      assert.ok(skillExists(name), `skill ${name} should exist`);
    }
    assert.ok(
      fs.existsSync(path.join(claudeSkills, "embed-toolkit", "shared"))
    );
  });

  it("second install exits with already-installed message", () => {
    const output = runInstall();
    assert.ok(output.includes("Already installed"));
  });

  it("--status shows installed", () => {
    const output = runInstall("--status");
    assert.ok(output.includes("embed-build"));
  });

  it("--force reinstalls cleanly", () => {
    runInstall("--force");
    assert.ok(skillExists("embed-build"));
    const output = runInstall("--status");
    assert.ok(output.includes("embed-build"));
  });

  it("--uninstall removes all skills", () => {
    runInstall("--uninstall");
    assert.ok(!skillExists("embed-build"));
    assert.ok(!skillExists("embed-flash"));
    const output = runInstall("--status");
    assert.ok(output.includes("NOT INSTALLED"));
  });

  it("--target installs to custom directory", () => {
    const customDir = path.join(tempHome, "custom", "skills");
    fs.mkdirSync(customDir, { recursive: true });

    runInstall("--target", customDir);
    assert.ok(
      fs.existsSync(path.join(customDir, "embed-build", "SKILL.md"))
    );
    assert.ok(
      fs.existsSync(path.join(customDir, "embed-toolkit", "shared"))
    );

    // Should NOT have installed to Claude path
    assert.ok(!skillExists("embed-build"));
  });

  it("OpenCode target creates command/*.md files", () => {
    // Clean first so OpenCode shows as not installed
    runInstall("--uninstall");

    const opencodeConfig = path.join(tempHome, ".config", "opencode");
    fs.mkdirSync(opencodeConfig, { recursive: true });
    const opencodeCommand = path.join(opencodeConfig, "command");

    runInstall();

    for (const name of [
      "embed-build", "embed-flash", "embed-serial", "embed-debug",
      "embed-diag", "embed-workflow", "embed-setup", "embed-test",
    ]) {
      assert.ok(
        fs.existsSync(path.join(opencodeCommand, `${name}.md`)),
        `OpenCode command ${name}.md should exist`
      );
    }
    // Shared files still deployed for OpenCode
    const opencodeShared = path.join(opencodeConfig, "skills", "embed-toolkit", "shared");
    assert.ok(fs.existsSync(opencodeShared));
  });

  it("OpenCode target does NOT create skills/<name>/SKILL.md directories", () => {
    const opencodeConfig = path.join(tempHome, ".config", "opencode");
    const opencodeSkills = path.join(opencodeConfig, "skills");

    for (const name of ["embed-build", "embed-flash"]) {
      assert.ok(
        !fs.existsSync(path.join(opencodeSkills, name, "SKILL.md")),
        `OpenCode skills/${name}/SKILL.md should NOT exist`
      );
    }
  });

  it("--uninstall removes OpenCode command/*.md files", () => {
    const opencodeConfig = path.join(tempHome, ".config", "opencode");
    const opencodeCommand = path.join(opencodeConfig, "command");

    runInstall("--uninstall");
    assert.ok(
      !fs.existsSync(path.join(opencodeCommand, "embed-build.md")),
      "OpenCode command file should be removed after uninstall"
    );
    assert.ok(
      !fs.existsSync(path.join(opencodeCommand, "embed-flash.md")),
      "OpenCode command file should be removed after uninstall"
    );
  });
});
