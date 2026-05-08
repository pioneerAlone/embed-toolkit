const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { detectTargetMCU } = require("../shared/embed_detect.js");

const FIXTURES = path.join(__dirname, "fixtures");

describe("detectTargetMCU", () => {
  it("detects MCU from cmake armgcc config.cmake", () => {
    const mcu = detectTargetMCU(
      path.join(FIXTURES, "cmake_project"),
      "cmake-armgcc"
    );
    assert.strictEqual(mcu, "RW612");
  });

  it("detects MCU from platformio.ini", () => {
    const mcu = detectTargetMCU(
      path.join(FIXTURES, "platformio_project"),
      "platformio"
    );
    assert.strictEqual(mcu, "esp32dev");
  });

  it("returns null when no MCU info", () => {
    const mcu = detectTargetMCU(
      path.join(FIXTURES, "make_project"),
      "make"
    );
    assert.strictEqual(mcu, null);
  });
});
