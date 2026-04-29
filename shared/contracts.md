# Shared Contracts

This document defines the minimal shared interface for all skills in embed-toolkit.

## Project Profile

Every skill reads or writes a standardized Project Profile. Fields are stable across all skills.

| Field | Required | Description |
|-------|----------|-------------|
| `workspace_root` | Yes | Absolute path to the firmware workspace |
| `workspace_os` | Yes | Host OS: `linux`, `macos`, or `windows` |
| `build_system` | Yes | Primary build system, e.g. `cmake`, `make`, `platformio`, `idf`, `keil`, `iar`, `custom` |
| `toolchain` | No | Toolchain family, e.g. `gnu-arm`, `clang`, `iar`, `keil`, `xtensa` |
| `target_mcu` | No | MCU family or specific chip model, e.g. `RW612`, `STM32F407VG`, `ESP32-S3` |
| `target_core` | No | CPU core, e.g. `Cortex-M33`, `Cortex-M4`, `Xtensa LX7` |
| `board` | No | Development board name if applicable |
| `rtos` | No | RTOS: `freertos`, `rt-thread`, `zephyr`, or `none` |
| `probe` | No | Debug probe: `jlink`, `stlink`, `cmsis-dap`, `openocd`, `pyocd` |
| `probe_config` | No | Probe-specific config (OpenOCD cfg files, J-Link device name, etc.) |
| `artifact_path` | No | Default firmware artifact path for flash/debug |
| `artifact_kind` | No | `elf`, `hex`, or `bin` |
| `serial_port` | No | Preferred serial port device path or COM port |
| `baud_rate` | No | Preferred serial baud rate |
| `gdb_executable` | No | Preferred GDB executable (e.g. `arm-none-eabi-gdb`) |
| `custom_build_cmd` | No | Custom build command (when `build_system` is `custom`) |
| `custom_flash_cmd` | No | Custom flash command (when flash method is `custom_script`) |
| `shell_commands` | No | List of known device shell commands |
| `notes` | No | Brief human notes not worth a structured field |

## Action Verbs

| Verb | Meaning |
|------|---------|
| `detect` | Inspect workspace or host environment and populate Project Profile |
| `build` | Configure and compile firmware artifact |
| `flash` | Program firmware onto target device |
| `attach` | Connect debugger without loading new firmware |
| `monitor` | Observe serial or runtime output |
| `reset` | Reset target device through current toolchain |
| `verify` | Confirm artifact, probe, or flash status |

## Decision Rules

- Explicit user input always overrides auto-detection results
- If a Project Profile exists, reuse it rather than re-detecting from scratch
- Always prefer `ELF` over `HEX` over `BIN` unless the downstream tool or user requires otherwise
- Never guess a `BIN` flash base address; block and ask if unknown
- If multiple equally valid board, probe, or serial candidates remain after detection, return `blocked` and list the candidates

## Skill Handoff Contract

When one skill passes results to the next, preserve:
- Standardized Project Profile
- Commands that were executed
- Key output (artifact paths, detected config)
- Failure taxonomy if the flow was interrupted
- Recommended next skill

## Command Outcome Schema

Every skill result must fall into one of:

- `success` — Requested action completed
- `partial_success` — Useful partial progress made, but primary goal not fully achieved
- `blocked` — Skill stopped because a high-risk unknown remains
- `failure` — Action failed despite sufficient information

All outcomes must include:

- `summary` — One sentence describing what happened
- `evidence` — Key logs, files, or detection evidence
- `next_action` — Recommended next command or skill
- `failure_category` — From [failure-taxonomy.md](failure-taxonomy.md) when status is not `success`

## Minimal Example

```yaml
status: success
summary: Built debug firmware with CMake, ELF artifact produced.
project_profile:
  workspace_root: /repo/fw
  workspace_os: linux
  build_system: cmake
  toolchain: gnu-arm
  target_mcu: stm32f429zi
  probe: stlink
  artifact_path: /repo/fw/build/debug/app.elf
  artifact_kind: elf
evidence:
  - cmake_preset: debug
  - artifact: /repo/fw/build/debug/app.elf
next_action: embed-flash
```
