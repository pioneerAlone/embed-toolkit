#!/usr/bin/env node

/**
 * embed_detect.js — Auto-detect embedded project characteristics
 *
 * Scans a workspace directory and identifies:
 *   - build system (cmake, make, platformio, idf, keil, iar)
 *   - target MCU
 *   - RTOS
 *   - available debug probes
 *   - available serial ports
 *   - existing firmware artifacts
 *
 * Zero dependencies — uses only Node.js built-in modules.
 *
 * Usage:
 *   node embed_detect.js [workspace_path]
 *   // Outputs JSON Project Profile to stdout
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// Fields where .embed.json values are merged into arrays rather than replaced
const MERGE_ARRAYS = new Set(["probes", "serial_ports", "all_artifacts", "shell_commands"]);

function detectOS() {
  const platform = os.platform();
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

function detectBuildSystem(workspace) {
  const markers = [
    ["CMakeLists.txt", "cmake"],
    ["Makefile", "make"],
    ["platformio.ini", "platformio"],
    ["sdkconfig", "idf"],
  ];

  for (const [filename, system] of markers) {
    const f = path.join(workspace, filename);
    if (fs.existsSync(f)) {
      if (filename === "CMakeLists.txt") {
        const content = fs.readFileSync(f, "utf-8");
        if (content.includes("arm-none-eabi")) {
          return "cmake-armgcc";
        }
        return "cmake";
      }
      return system;
    }
  }

  // Check subdirectories for CMakeLists.txt (common in NXP SDK: armgcc/CMakeLists.txt)
  for (const subdir of ["armgcc", "gcc", "build"]) {
    const f = path.join(workspace, subdir, "CMakeLists.txt");
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, "utf-8");
      if (content.includes("arm-none-eabi") || fs.existsSync(path.join(workspace, subdir, "config.cmake"))) {
        return "cmake-armgcc";
      }
      return "cmake";
    }
  }

  // Check for Keil/IAR project files
  try {
    const files = fs.readdirSync(workspace);
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (ext === ".uvprojx" || ext === ".uvproj") return "keil";
      if (ext === ".eww" || ext === ".ewp") return "iar";
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function detectTargetMCU(workspace, buildSystem) {
  // CMake config (check both workspace root and armgcc/ subdirectory)
  if (buildSystem && buildSystem.startsWith("cmake")) {
    for (const subdir of ["armgcc", "gcc", ""]) {
      const cfgPath = subdir ? path.join(workspace, subdir, "config.cmake") : path.join(workspace, "config.cmake");
      if (fs.existsSync(cfgPath)) {
        const content = fs.readFileSync(cfgPath, "utf-8");
        const deviceMatch = content.match(/set\(CONFIG_DEVICE\s+(\S+)\)/);
        const boardMatch = content.match(/set\(CONFIG_BOARD\s+(\S+)\)/);
        const coreMatch = content.match(/set\(CONFIG_CORE\s+(\S+)\)/);
        if (deviceMatch) return deviceMatch[1];
        if (boardMatch) return boardMatch[1];
      }
    }

    // Check CMakeLists.txt for MCU hints
    const cmakeLists = path.join(workspace, "CMakeLists.txt");
    if (fs.existsSync(cmakeLists)) {
      const content = fs.readFileSync(cmakeLists, "utf-8");
      const cpuMatch = content.match(/CPU_(\w+)/);
      const mcuMatch = content.match(/MCU[= ]+(\S+)/i);
      if (mcuMatch) return mcuMatch[1];
    }
  }

  // Keil
  if (buildSystem === "keil") {
    try {
      const files = fs.readdirSync(workspace);
      for (const f of files) {
        if (f.endsWith(".uvprojx") || f.endsWith(".uvproj")) {
          const content = fs.readFileSync(path.join(workspace, f), "utf-8");
          const m = content.match(/<Device>(.*?)<\/Device>/);
          if (m) return m[1];
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // PlatformIO
  if (buildSystem === "platformio") {
    const ini = path.join(workspace, "platformio.ini");
    if (fs.existsSync(ini)) {
      const content = fs.readFileSync(ini, "utf-8");
      const m = content.match(/board\s*=\s*(\S+)/);
      if (m) return m[1];
    }
  }

  // ESP-IDF
  if (buildSystem === "idf") {
    const sdkconfig = path.join(workspace, "sdkconfig");
    if (fs.existsSync(sdkconfig)) {
      const content = fs.readFileSync(sdkconfig, "utf-8");
      const m = content.match(/CONFIG_IDF_TARGET="(\S+)"/);
      if (m) return m[1];
    }
  }

  return null;
}

function detectRTOS(workspace) {
  const headerPatterns = [
    ["FreeRTOS.h", "freertos"],
    ["rtthread.h", "rt-thread"],
    ["zephyr/kernel.h", "zephyr"],
  ];
  const symbolPatterns = [
    ["vTaskStartScheduler", "freertos"],
    ["rt_thread_init", "rt-thread"],
    ["k_thread_create", "zephyr"],
  ];

  // Search source files (max depth 4)
  function walk(dir, depth) {
    if (depth > 4) return null;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return null;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const result = walk(path.join(dir, entry.name), depth + 1);
        if (result) return result;
      } else if (entry.name.endsWith(".c") || entry.name.endsWith(".h") || entry.name.endsWith(".cpp")) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          for (const [header, rtos] of headerPatterns) {
            if (content.includes(`#include "${header}"`) || content.includes(`#include <${header}>`)) {
              return rtos;
            }
          }
          for (const [symbol, rtos] of symbolPatterns) {
            if (content.includes(symbol)) return rtos;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  }

  return walk(workspace, 0);
}

function detectProbes() {
  const probes = [];
  try {
    // Check PATH for known probe tools
    ["JLinkExe", "openocd", "pyocd", "st-flash", "st-info"].forEach((tool) => {
      try {
        execSync(`which ${tool}`, { stdio: "ignore" });
        if (tool === "JLinkExe") probes.push("jlink");
        else if (tool === "openocd") probes.push("openocd");
        else if (tool === "pyocd") probes.push("pyocd");
        else if (tool === "st-flash" || tool === "st-info") {
          if (!probes.includes("stlink")) probes.push("stlink");
        }
      } catch (e) {
        // tool not found
      }
    });
  } catch (e) {
    // ignore
  }
  return probes;
}

function detectSerialPorts() {
  const ports = [];
  const platform = os.platform();

  if (platform === "darwin") {
    // macOS — filter out Bluetooth and other non-hardware serial ports
    const excludePatterns = [/Bluetooth/i, /Incoming/i, /WISHEE/i, /iFLY/i, /Wireless/i];
    try {
      const dev = "/dev";
      const files = fs.readdirSync(dev);
      for (const f of files) {
        if (!f.startsWith("cu.")) continue;
        const fullPath = path.join(dev, f);
        const excluded = excludePatterns.some((pat) => pat.test(f));
        if (!excluded) {
          ports.push(fullPath);
        }
      }
    } catch (e) {
      // ignore
    }
  } else if (platform === "linux") {
    // Linux
    try {
      const dev = "/dev";
      const files = fs.readdirSync(dev);
      for (const f of files) {
        if (f.startsWith("ttyACM") || f.startsWith("ttyUSB")) {
          ports.push(path.join(dev, f));
        }
      }
    } catch (e) {
      // ignore
    }
  } else {
    // Windows — can't scan via filesystem easily
    // User must specify COM port
  }

  return ports;
}

function detectArtifacts(workspace) {
  const artifacts = [];
  const buildDirs = ["build", "Build", "output", "Output", "Debug", "Release", ".pio/build", "armgcc"];

  for (const bdName of buildDirs) {
    const bd = path.join(workspace, bdName);
    if (!fs.existsSync(bd)) continue;
    try {
      walkDir(bd);
    } catch (e) {
      // ignore
    }
  }

  function walkDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walkDir(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const kindMap = { ".elf": "elf", ".hex": "hex", ".bin": "bin", ".axf": "elf" };
        const kind = kindMap[ext];
        if (kind) {
          artifacts.push({ path: fullPath, kind });
        }
      }
    }
  }

  // Prefer ELF
  const elfs = artifacts.filter((a) => a.kind === "elf");
  return elfs.length > 0 ? elfs : artifacts;
}

function detectProject(workspace) {
  const buildSystem = detectBuildSystem(workspace);
  const targetMcu = detectTargetMCU(workspace, buildSystem);
  const rtos = detectRTOS(workspace);
  const probes = detectProbes();
  const serialPorts = detectSerialPorts();
  const artifacts = detectArtifacts(workspace);

  const profile = {
    workspace_root: workspace,
    workspace_os: detectOS(),
  };

  if (buildSystem) {
    profile.build_system = buildSystem;
    // Infer toolchain from build system
    if (buildSystem.startsWith("cmake-armgcc") || buildSystem === "make") {
      profile.toolchain = "gnu-arm";
    } else if (buildSystem === "idf") {
      profile.toolchain = "xtensa";
    }
  }
  if (targetMcu) {
    profile.target_mcu = targetMcu;
  }
  if (rtos) {
    profile.rtos = rtos;
  }
  if (probes.length > 0) {
    profile.probes = probes;
  }
  if (serialPorts.length === 1) {
    profile.serial_port = serialPorts[0];
  } else if (serialPorts.length > 1) {
    profile.serial_ports = serialPorts;
  }
  if (artifacts.length > 0) {
    profile.artifact_path = artifacts[0].path;
    profile.artifact_kind = artifacts[0].kind;
    if (artifacts.length > 1) {
      profile.all_artifacts = artifacts;
    }
  }

  // Attempt to detect if the project has a custom flash/build script
  if (fs.existsSync(path.join(workspace, "scripts", "flash_debug.sh"))) {
    profile.custom_flash_detected = path.join(workspace, "scripts", "flash_debug.sh");
  }
  if (fs.existsSync(path.join(workspace, "scripts", "build_flash_debug.sh"))) {
    profile.custom_build_detected = path.join(workspace, "scripts", "build_flash_debug.sh");
  }

  return profile;
}

function readEmbedJson(workspace) {
  const embedJsonPath = path.join(workspace, ".embed.json");
  if (!fs.existsSync(embedJsonPath)) return null;
  try {
    const content = fs.readFileSync(embedJsonPath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`Warning: failed to parse .embed.json: ${e.message}`);
    return null;
  }
}

function mergeProfile(autoProfile, embedOverrides, cliOverrides) {
  const merged = { ...autoProfile };

  // Layer 1: .embed.json overrides
  if (embedOverrides) {
    for (const [key, value] of Object.entries(embedOverrides)) {
      if (value === null || value === undefined) continue;
      if (MERGE_ARRAYS.has(key) && Array.isArray(value) && Array.isArray(merged[key])) {
        const existing = new Set(merged[key].map((item) => JSON.stringify(item)));
        for (const item of value) {
          if (!existing.has(JSON.stringify(item))) {
            merged[key].push(item);
          }
        }
      } else {
        merged[key] = value;
      }
    }
  }

  // Layer 2: CLI overrides (highest priority)
  if (cliOverrides) {
    for (const [key, value] of Object.entries(cliOverrides)) {
      if (value === null || value === undefined) continue;
      merged[key] = value;
    }
  }

  return merged;
}

function saveProfile(profile, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  profile._meta = {
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    source: "embed_detect.js",
  };
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
}

function loadProfile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`Warning: failed to load profile: ${e.message}`);
    return null;
  }
}

// --- Main ---
function main() {
  const args = process.argv.slice(2);

  // Parse CLI flags
  let profilePath = null;
  let savePath = null;
  let saveRequested = false;
  const cliOverrides = {};
  const positionalArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && i + 1 < args.length) {
      profilePath = args[++i];
    } else if (args[i] === "--save") {
      saveRequested = true;
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        savePath = args[++i];
      }
    } else if (args[i] === "--override" && i + 1 < args.length) {
      const parts = args[++i].split("=");
      if (parts.length >= 2) {
        cliOverrides[parts[0]] = parts.slice(1).join("=");
      }
    } else if (!args[i].startsWith("--")) {
      positionalArgs.push(args[i]);
    }
  }

  const workspace =
    positionalArgs.length > 0 ? path.resolve(positionalArgs[0]) : process.cwd();

  if (!fs.existsSync(workspace)) {
    console.error(`Error: workspace not found: ${workspace}`);
    process.exit(1);
  }

  // Load base profile (from --profile flag or auto-detection)
  let baseProfile = null;
  if (profilePath) {
    baseProfile = loadProfile(path.resolve(profilePath));
  }

  // Auto-detect
  const autoProfile = detectProject(workspace);

  // Merge base with auto (auto wins for fields it detects)
  const mergedBase = baseProfile ? { ...baseProfile, ...autoProfile } : autoProfile;

  // Read .embed.json from workspace
  const embedOverrides = readEmbedJson(workspace);

  // Merge all layers: auto-detect + .embed.json + CLI
  const finalProfile = mergeProfile(mergedBase, embedOverrides, cliOverrides);

  // Save if requested
  if (saveRequested) {
    const dest = savePath || path.join(workspace, ".embed_profile.json");
    saveProfile(finalProfile, dest);
  }

  console.log(JSON.stringify(finalProfile, null, 2));
}

main();
