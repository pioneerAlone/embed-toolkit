const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const {
  readEmbedJson,
  mergeProfile,
  saveProfile,
  loadProfile,
} = require("../shared/embed_detect.js");

const FIXTURES = path.join(__dirname, "fixtures");

describe("readEmbedJson", () => {
  it("reads .embed.json from workspace", () => {
    const overrides = readEmbedJson(path.join(FIXTURES, "embed_json_project"));
    assert.deepStrictEqual(overrides, {
      target_mcu: "STM32F407VG",
      baud_rate: 115200,
    });
  });

  it("returns null when .embed.json absent", () => {
    assert.strictEqual(
      readEmbedJson(path.join(FIXTURES, "no_build_system")),
      null
    );
  });
});

describe("mergeProfile", () => {
  it("applies .embed.json overrides", () => {
    const auto = { workspace_root: "/ws", target_mcu: "AUTO_MCU" };
    const overrides = { target_mcu: "OVERRIDE_MCU" };
    const result = mergeProfile(auto, overrides, null);
    assert.strictEqual(result.target_mcu, "OVERRIDE_MCU");
    assert.strictEqual(result.workspace_root, "/ws");
  });

  it("CLI overrides take highest priority", () => {
    const auto = { target_mcu: "AUTO" };
    const embed = { target_mcu: "EMBED" };
    const cli = { target_mcu: "CLI" };
    const result = mergeProfile(auto, embed, cli);
    assert.strictEqual(result.target_mcu, "CLI");
  });

  it("null values in overrides are ignored", () => {
    const auto = { target_mcu: "AUTO" };
    const embed = { target_mcu: null };
    const result = mergeProfile(auto, embed, null);
    assert.strictEqual(result.target_mcu, "AUTO");
  });

  it("empty string in overrides is applied", () => {
    const auto = { build_cmd: "make" };
    const embed = { build_cmd: "" };
    const result = mergeProfile(auto, embed, null);
    assert.strictEqual(result.build_cmd, "");
  });

  it("merges array fields additively", () => {
    const auto = { probes: ["jlink"], serial_ports: ["/dev/cu.a"] };
    const embed = {
      probes: ["openocd"],
      serial_ports: ["/dev/cu.b"],
    };
    const result = mergeProfile(auto, embed, null);
    assert.deepStrictEqual(result.probes, ["jlink", "openocd"]);
    assert.deepStrictEqual(result.serial_ports, ["/dev/cu.a", "/dev/cu.b"]);
  });

  it("avoids duplicate array entries", () => {
    const auto = { probes: ["jlink", "openocd"] };
    const embed = { probes: ["openocd"] };
    const result = mergeProfile(auto, embed, null);
    assert.deepStrictEqual(result.probes, ["jlink", "openocd"]);
  });

  it("returns auto profile when no overrides", () => {
    const auto = { target_mcu: "AUTO" };
    const result = mergeProfile(auto, null, null);
    assert.deepStrictEqual(result, auto);
  });
});

describe("saveProfile and loadProfile", () => {
  it("saves and loads profile roundtrip", () => {
    const tmp = path.join(os.tmpdir(), "test_embed_profile_" + Date.now() + ".json");
    const profile = {
      workspace_root: "/test",
      target_mcu: "TEST",
    };
    saveProfile(profile, tmp);
    assert.ok(fs.existsSync(tmp));

    const loaded = loadProfile(tmp);
    assert.strictEqual(loaded.workspace_root, "/test");
    assert.strictEqual(loaded.target_mcu, "TEST");
    assert.ok(loaded._meta);
    assert.ok(loaded._meta.timestamp);

    fs.unlinkSync(tmp);
  });

  it("loadProfile returns null for missing file", () => {
    assert.strictEqual(
      loadProfile("/tmp/nonexistent_embed_profile.json"),
      null
    );
  });
});
