const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { detectBuildSystem } = require("../shared/embed_detect.js");

const FIXTURES = path.join(__dirname, "fixtures");

describe("detectBuildSystem", () => {
  it("detects cmake-armgcc project from armgcc/ subdirectory", () => {
    assert.strictEqual(
      detectBuildSystem(path.join(FIXTURES, "cmake_project")),
      "cmake-armgcc"
    );
  });

  it("detects make project", () => {
    assert.strictEqual(
      detectBuildSystem(path.join(FIXTURES, "make_project")),
      "make"
    );
  });

  it("detects platformio project", () => {
    assert.strictEqual(
      detectBuildSystem(path.join(FIXTURES, "platformio_project")),
      "platformio"
    );
  });

  it("returns null for empty directory", () => {
    assert.strictEqual(
      detectBuildSystem(path.join(FIXTURES, "no_build_system")),
      null
    );
  });

  it("detects build system in embed_json project (also has CMakeLists.txt)", () => {
    const result = detectBuildSystem(path.join(FIXTURES, "embed_json_project"));
    assert.ok(result === "cmake" || result === "cmake-armgcc");
  });
});
