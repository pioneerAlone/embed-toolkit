---
name: embed-setup
description: Toolchain setup and verification for embedded development — check for required tools, report versions, and provide platform-specific install instructions.
---

# embed-setup — Toolchain Setup & Verification

## When to Use

- User says "setup", "install toolchain", "check tools", "verify environment", "is my environment ready"
- First time setting up a project or a new development machine
- After OS upgrade or toolchain update
- Builds fail with "command not found" errors

## Required Inputs

- Host platform (auto-detected)
- Optional: `.embed.json` overrides for expected toolchain paths

## Auto-Detection

1. Detect host OS (macOS/Linux/Windows)
2. Check PATH for each required tool
3. Report version numbers for found tools
4. Priority: user input > `.embed.json` > auto-detection > report missing

## Steps

### Modes

| Mode | Trigger Phrases | Description |
|------|----------------|-------------|
| `check` | "check", "verify", "scan" | Quick scan — report what's installed and what's missing |
| `full` | "full check", "deep check", "verify all" | Compile a test program to validate toolchain end-to-end |
| `fix` | "fix", "install", "setup" | Provide install instructions for missing tools |

### Mode: `check` — Quick Environment Scan

Check for these tools and report version and path for each found:

| Category | Tools |
|----------|-------|
| Build | `cmake`, `make`, `ninja` |
| ARM GCC | `arm-none-eabi-gcc`, `arm-none-eabi-g++`, `arm-none-eabi-gdb` |
| Debug | `openocd`, `JLinkExe`, `pyocd`, `st-flash` |
| Serial | `python3`, `pyserial` (try `python3 -c "import serial"`) |
| ESP32 | `idf.py` (if ESP-IDF project detected) |
| PlatformIO | `pio` (if PlatformIO project detected) |

For each found tool, report: tool name, version string, resolved path.

For each missing tool, mark as MISSING.

### Mode: `full` — Compile Test

1. Create a minimal C program in a temp directory:
   ```c
   #include <stdint.h>
   int main(void) { volatile uint32_t x = 0xDEADBEEF; return (int)(x & 1); }
   ```
2. Compile with `arm-none-eabi-gcc -mcpu=cortex-m4 -mthumb -nostdlib -Ttext=0x08000000 -o /tmp/embed_test.elf test.c`
3. Check exit code and output file existence
4. Optionally: run `arm-none-eabi-objdump -h /tmp/embed_test.elf` to verify sections
5. Report: PASS (compiled successfully) or FAIL (with error message)

### Mode: `fix` — Install Missing Tools

For each missing tool, provide OS-specific install instructions:

| Tool | macOS | Linux (apt) | Windows |
|------|-------|-------------|---------|
| `cmake` | `brew install cmake` | `sudo apt install cmake` | Download from cmake.org |
| `make` | Built-in (Xcode) | `sudo apt install build-essential` | Via MinGW or MSYS2 |
| ARM GCC | `brew install --cask gcc-arm-embedded` | `sudo apt install gcc-arm-none-eabi` | Download from developer.arm.com |
| `openocd` | `brew install openocd` | `sudo apt install openocd` | Download from openocd.org |
| `JLinkExe` | Download from segger.com | Download from segger.com | Download from segger.com |
| `pyocd` | `pip3 install pyocd` | `pip3 install pyocd` | `pip3 install pyocd` |
| `pyserial` | `pip3 install pyserial` | `pip3 install pyserial` | `pip3 install pyserial` |

Only suggest tools that are actually missing. Don't list instructions for tools already installed.

## Failure Triage

| Scenario | Category |
|----------|----------|
| ARM GCC not found and can't be installed automatically | `environment-missing` |
| Tool found but version too old for target | `project-config-error` |
| Compile test fails with cryptic error | `environment-missing` |
| Multiple toolchain versions installed, can't choose | `ambiguous-context` |

## Platform Notes

- macOS ARM GCC is typically at `/usr/local/arm-none-eabi/bin/` or Homebrew-managed
- Linux: check `/usr/bin/arm-none-eabi-gcc` or `/opt/gcc-arm-none-eabi/`
- Windows: common paths are `C:\Program Files (x86)\GNU Arm Embedded Toolchain\...`
- ESP-IDF and PlatformIO manage their own toolchains — check their respective commands

## Output Contract

```yaml
status: success | partial_success | failure
summary: "Environment check: 8/10 tools found. Missing: openocd, pyserial."
project_profile:
  # Enrich with discovered tool paths and versions
evidence:
  - "arm-none-eabi-gcc: 12.3.1 (/usr/local/bin/arm-none-eabi-gcc)"
  - "cmake: 3.28.1"
  - "JLinkExe: 7.94"
  - "python3 + pyserial: MISSING — pip3 install pyserial"
next_action: embed-build (if all build tools present) or null (fix missing first)
```

## Handoff

- All build tools present: recommend `embed-build`
- Missing critical tools: suggest running `embed-setup fix` mode
- Partial: report what works, what needs fixing
