# embed-toolkit

[![CI](https://github.com/pioneerAlone/embed-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/pioneerAlone/embed-toolkit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/embed-toolkit)](https://www.npmjs.com/package/embed-toolkit)
[![license](https://img.shields.io/npm/l/embed-toolkit)](LICENSE)

Universal embedded development skills for Claude Code.

## What is this?

A set of 11 skills that give Claude Code the ability to build, flash, monitor, debug, diagnose, analyze memory, debug crashes, and run static analysis on embedded firmware projects — across MCU platforms and build systems.

## Skills

| Skill | Description |
|-------|-------------|
| `embed-build` | Build firmware with CMake/Makefile/PlatformIO/ESP-IDF or custom script |
| `embed-flash` | Flash firmware via OpenOCD/J-Link/pyOCD or custom script |
| `embed-serial` | Serial monitor & logger (start/stop/view/filter) |
| `embed-debug` | GDB debugging (attach/break/backtrace/crash analysis) |
| `embed-diag` | Runtime diagnostics (shell commands, AT commands, log analysis) |
| `embed-workflow` | One-click: build → flash → verify → diagnose |
| `embed-setup` | Toolchain check & verification — detect missing tools, report versions, suggest installs |
| `embed-test` | Test runner — Unity/CppUTest/Ceedling/Google Test, on-host or on-target |
| `embed-memory` | Memory analysis — Flash/RAM usage from .map/ELF, symbol size ranking, build diff |
| `embed-crash` | Crash analysis — HardFault/BusFault/UsageFault decoding, stack trace reconstruction |
| `embed-static` | Static analysis — cppcheck, clang-tidy, GCC analyzer, MISRA-C compliance checks |

## Quick Install

```bash
# Install to all detected tools (Claude Code, OpenCode, etc.)
curl -fsSL https://raw.githubusercontent.com/pioneerAlone/embed-toolkit/main/install.sh | bash

# Install to a specific tool only
curl -fsSL https://raw.githubusercontent.com/pioneerAlone/embed-toolkit/main/install.sh | bash -s -- --tool claude
curl -fsSL https://raw.githubusercontent.com/pioneerAlone/embed-toolkit/main/install.sh | bash -s -- --tool opencode

# Install from GitHub via npx (Node.js required)
npx github:pioneerAlone/embed-toolkit --force --tool opencode

# Install from local clone
git clone https://github.com/pioneerAlone/embed-toolkit.git
cd embed-toolkit
bash install.sh        # pure bash, zero dependencies
# or
node install.js        # Node.js
# or
python3 install.py     # Python 3
```

> **Note:** If `npx` seems to use a stale version, clear its cache first: `rm -rf ~/.npm/_npx`

## Quick Start

After installation, navigate to your firmware project and use any skill:

```
/build              # Build the firmware
/flash              # Flash to device
/serial start       # Start serial monitor
/serial view        # View captured logs
/workflow           # Build + flash + verify + diagnose
/setup              # Check and verify toolchain environment
/test               # Run unit/integration tests
/memory             # Analyze firmware memory (Flash/RAM usage from .map/ELF)
/crash              # Analyze crash dumps (HardFault decode, stack trace)
/static             # Run static analysis (cppcheck, clang-tidy, MISRA)
```

## How It Works

1. Enter any embedded project directory
2. embed-toolkit auto-detects: build system, MCU, RTOS, debug probes, serial ports
3. Skills use this profile to run the right commands
4. Results standardized with failure taxonomy for clear diagnostics

## Per-Project Configuration (Optional)

Add `.embed.json` to your project root to override auto-detection:

```json
{
  "target_mcu": "STM32F407VG",
  "serial_port": "/dev/cu.usbserial-110",
  "baud_rate": 115200,
  "flash_cmd": "./scripts/flash.sh",
  "shell_commands": ["help", "status", "reboot"]
}
```

Detection priority: **user input > .embed.json > auto-detect > defaults > ask user**

## Supported Platforms

- **Host**: macOS, Linux, Windows
- **MCU**: NXP (RW6xx, i.MX RT), STM32 (F4, F7, H7, G0, L4), ESP32 (S2, S3, C3), TI (CC系列), and any arm-gcc target
- **Build Systems**: CMake, Makefile, PlatformIO, ESP-IDF, Keil MDK, IAR EWARM, custom scripts
- **Debug Probes**: J-Link, ST-Link, OpenOCD, pyOCD
- **RTOS**: FreeRTOS, RT-Thread, Zephyr

## Uninstall

```bash
# Remove from all targets
bash install.sh --uninstall

# Remove from a specific tool
bash install.sh --uninstall --tool opencode
node install.js --uninstall --tool claude
```

## License

MIT
