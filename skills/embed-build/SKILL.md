---
name: embed-build
description: Build embedded firmware — automatically detects build system (CMake, Makefile, PlatformIO, ESP-IDF, Keil, IAR, or custom script) and produces firmware artifacts.
---

# embed-build — Universal Firmware Build

## When to Use

- User says "build", "compile", "make", or "recompile the firmware"
- User wants to check if code compiles before flashing
- Part of `/embed-workflow` orchestration
- After modifying source files and before debugging

## Required Inputs

- A Project Profile with at least `workspace_root` (everything else auto-detected)
- Optional: `build_system` hint, `build_cmd` override from `.embed.json`

## Auto-Detection

1. Check `.embed.json` in workspace root for `build_cmd` or `build_system` overrides
2. Run `embed_detect.js` to identify build system from workspace markers
3. Priority: user input > `.embed.json` > auto-detection > block and ask

## Steps

### 1. Detect Build System

Run `node <toolkit_dir>/shared/embed_detect.js <workspace_root>` and read `build_system` field.

### 2. Execute Build

| Build System | Action |
|-------------|--------|
| `cmake` | Find the build directory. Run `cmake --build <build_dir>` or `cmake -B <build_dir> && cmake --build <build_dir>`. Pass `-j` for parallel builds. |
| `cmake-armgcc` | Find `armgcc/` or `gcc/` subdirectory. Check for build script (`build_flash_debug.sh`, `build_debug.sh`). If present, execute it. Otherwise run `cmake` with `-DCMAKE_TOOLCHAIN_FILE=...` pointing to the ARM GCC toolchain file, then `make -j`. |
| `make` | Run `make -j` in the workspace root or the directory containing the Makefile. Set `CROSS_COMPILE=arm-none-eabi-` if needed. |
| `platformio` | Run `pio run` in workspace root. |
| `idf` | Run `idf.py build` in workspace root. |
| `keil` | Build with `UV4.exe -r <project>.uvprojx -j0` or similar. |
| `iar` | Build with `IarBuild.exe <project>.ewp -build <config>`. |
| `custom` / detected custom script | Execute `build_cmd` from `.embed.json` or detected `custom_build_detected` from auto-detection. |

**Toolchain**: If `toolchain` is `gnu-arm`, ensure `arm-none-eabi-gcc` is in PATH. Set `ARMGCC_DIR` environment variable if the build scripts require it (common for NXP SDK projects).

### 3. Locate Artifact

After build succeeds, scan for firmware artifacts:
- ELF: most preferred (contains debug symbols)
- HEX: second preference
- BIN: last preference (base address required for flashing)

Common locations: `build/`, `armgcc/flash_debug/`, `armgcc/flash_release/`, `Debug/`, `Release/`, `output/`, `.pio/build/`.

Update the Project Profile with `artifact_path`, `artifact_kind`, and `artifact_size`.

### 4. Report

- Build result (success/failure)
- Artifact path, kind, and size
- Warning count (parse build output for warning patterns)
- If build fails: extract error lines and categorize

## Failure Triage

| Scenario | Category |
|----------|----------|
| `cmake` or `arm-none-eabi-gcc` not found | `environment-missing` |
| CMakeLists.txt missing or malformed | `project-config-error` |
| Build script exists but fails to execute | `project-config-error` |
| Build succeeds but no artifact found | `artifact-missing` |
| Multiple build presets/configs and no explicit choice | `ambiguous-context` |
| Build directory not writable | `permission-problem` |

## Platform Notes

- On Windows, ARM GCC toolchain may be at `C:\Program Files (x86)\GNU Arm Embedded Toolchain\...`. Check common install paths.
- On macOS, ARM GCC is typically at `/usr/local/arm-none-eabi/bin/` or via Homebrew.
- On Linux, check `/usr/bin/arm-none-eabi-gcc` or `/opt/gcc-arm-none-eabi/`.
- Keil and IAR build support is Windows-only.

## Output Contract

```yaml
status: success | failure | blocked
summary: "Built debug firmware (CMake/armgcc), ELF: 248KB"
project_profile:
  artifact_path: /path/to/firmware.elf
  artifact_kind: elf
  artifact_size: "248KB"
evidence:
  - "cmake --build armgcc -j8"
  - "Artifact: armgcc/flash_debug/quec_ppp_dial.elf (254312 bytes)"
next_action: embed-flash
```

## Handoff

- On success: pass `artifact_path` and `artifact_kind` to `embed-flash` or `embed-debug`
- On failure with tool missing: recommend install command
- On failure with config error: recommend checking CMakeLists.txt or build configuration
