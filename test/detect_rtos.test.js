const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { detectRTOS } = require("../shared/embed_detect.js");

const FIXTURES = path.join(__dirname, "fixtures");

describe("detectRTOS", () => {
  it("detects FreeRTOS from header include", () => {
    const rtos = detectRTOS(path.join(FIXTURES, "freertos_project"));
    assert.strictEqual(rtos, "freertos");
  });

  it("returns null when no RTOS indicators", () => {
    const rtos = detectRTOS(path.join(FIXTURES, "make_project"));
    assert.strictEqual(rtos, null);
  });

  it("returns null for empty directory", () => {
    const rtos = detectRTOS(path.join(FIXTURES, "no_build_system"));
    assert.strictEqual(rtos, null);
  });
});
