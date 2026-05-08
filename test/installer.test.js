const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

const INSTALL_JS = path.join(__dirname, "..", "install.js");

describe("installer", () => {
  let tempHome;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "embed_test_home_"));
    const skillsDir = path.join(tempHome, ".claude", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function runInstall(...args) {
    return execSync(`HOME=${tempHome} node "${INSTALL_JS}" ${args.join(" ")}`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
  }

  function skillExists(name) {
    return fs.existsSync(
      path.join(tempHome, ".claude", "skills", name, "SKILL.md")
    );
  }

  it("fresh install creates all skills", () => {
    runInstall();
    assert.ok(skillExists("embed-build"));
    assert.ok(skillExists("embed-flash"));
    assert.ok(skillExists("embed-serial"));
    assert.ok(skillExists("embed-debug"));
    assert.ok(skillExists("embed-diag"));
    assert.ok(skillExists("embed-workflow"));
    assert.ok(
      fs.existsSync(
        path.join(tempHome, ".claude", "skills", "embed-toolkit", "shared")
      )
    );
  });

  it("second install exits with already-installed message", () => {
    const output = runInstall();
    assert.ok(output.includes("Already installed"));
  });

  it("--status shows installed", () => {
    const output = runInstall("--status");
    assert.ok(output.includes("INSTALLED"));
  });

  it("--force reinstalls cleanly", () => {
    runInstall("--force");
    assert.ok(skillExists("embed-build"));
    const output = runInstall("--status");
    assert.ok(output.includes("INSTALLED"));
  });

  it("--uninstall removes all skills", () => {
    runInstall("--uninstall");
    assert.ok(!skillExists("embed-build"));
    assert.ok(!skillExists("embed-flash"));
    const output = runInstall("--status");
    assert.ok(output.includes("NOT INSTALLED"));
  });
});
