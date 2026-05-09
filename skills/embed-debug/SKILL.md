---
name: embed-debug
description: GDB-based firmware debugging — attach to target, set breakpoints, capture backtraces, and analyze crashes (HardFault/MemManage/BusFault) via OpenOCD, J-Link GDB Server, ST-Link, or pyOCD. Supports Zephyr, ESP-IDF, and PlatformIO debug entry points.
---

# embed-debug — GDB Firmware Debugging

## When to Use

- User says "debug", "gdb", "breakpoint", "backtrace", "step through", "attach debugger"
- After a crash or HardFault with device still attached to debug probe
- Device is unresponsive and user needs to inspect registers and stack
- After flashing and user wants to step through initialization
- User wants to set a condition breakpoint (loop counter, timing, null pointer)
- User wants RTOS task-aware debugging (FreeRTOS/Zephyr)

> If the device has already crashed and been disconnected, or the user only has serial output — use `embed-crash` for offline analysis instead.

## Required Inputs

- A Project Profile with `artifact_path` (ELF with debug symbols — `-g` or `-Og` required)
- A debug probe (J-Link, ST-Link, OpenOCD, pyOCD)
- Optional: breakpoint function names or addresses
- Optional: conditions for conditional breakpoints

## Auto-Detection

1. Check `.embed.json` for `gdb_executable`, `probe`, `probe_config`
2. Check if a GDB server is already running (ports 2331, 3333, 4242, 9000)
3. Run `python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py detect` to find available tools
4. Zephyr project → prefer `west debug`. ESP-IDF → prefer `idf.py gdb`. PlatformIO → prefer `pio debug`
5. Priority: platform wrapper > user-specified GDB > auto-detection > ask user

## Steps

### 1. Choose Debug Method

Use the decision tree in `references/debug-playbook.md` to pick the right method:

| Mode | Trigger | What It Does |
|------|---------|---------------|
| `download-and-halt` | "debug", "attach", "start debugging" | Flash ELF, halt at entry. Default mode. |
| `attach-only` | "attach to running", "connect without flash" | Halt running target, read state. No flash. |
| `crash-context` | "crash", "hard fault", "what crashed" | Read fault registers (CFSR/HFSR/MMFAR/BFAR), bt, register dump |
| `step-debug` | "step", "breakpoint at...", "step through" | Set breakpoints, step through, inspect variables |
| `condition-break` | "loop crash", "timer crash", "null pointer" | Set conditional breakpoints for intermittent bugs |
| `release` | "disconnect", "detach", "reset and run" | Reset device, detach GDB, stop server, restore normal operation |

### 2. Select Platform Entry Point

| Build System | Entry Point | Notes |
|-------------|-------------|-------|
| Zephyr | `west debug` | Auto-handles server + GDB. See `references/platform-debug.md` |
| ESP-IDF | `idf.py gdb` | Auto-starts OpenOCD. Built-in USB-JTAG on C3/S3 |
| PlatformIO | `pio debug` | Reads `debug_tool` from `platformio.ini` |
| ARM GCC / Make / CMake | Manual GDB server + GDB | Use `scripts/gdb_helper.py start-server` |

### 3. Start GDB Server

**If using platform wrapper** (Zephyr/ESP-IDF/PlatformIO), skip this step — the wrapper handles it.

**If using bare-metal GDB**, use the helper script:

```bash
# Detect available tools
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py detect

# Start GDB server (auto-detects probe type from Project Profile)
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py start-server \
  --probe openocd \
  --interface stlink \
  --target stm32f4x \
  --port 3333

# Or for J-Link:
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py start-server \
  --probe jlink \
  --device STM32F407VG

# Or for ST-Link:
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py start-server \
  --probe stlink
```

The script waits for the port to open (15s timeout) and reports the PID.

### 4. Execute GDB Commands

**Platform wrappers** are preferred when available:

```bash
# Zephyr
west debug

# ESP-IDF (interactive)
idf.py gdb
# ESP-IDF (batch backtrace)
idf.py gdb --batch -ex "bt full" -ex "quit"

# PlatformIO
pio debug -e <env_name>
```

**Bare-metal GDB batch mode** (use for scripted backtrace, register dump, crash analysis):

```bash
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py batch \
  --elf firmware.elf \
  --port 3333 \
  --gdb arm-none-eabi-gdb \
  --commands "monitor reset halt" "b main" "continue" "bt full" "info registers"
```

Or raw GDB for interactive use:

```bash
arm-none-eabi-gdb firmware.elf -ex "target extended-remote :3333" -ex "monitor reset halt"
```

### 5. Mode: crash-context

When target has faulted, read and decode fault registers:

```bash
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py batch \
  --elf firmware.elf --port 3333 --gdb arm-none-eabi-gdb \
  --commands \
    "p/x *(unsigned*)0xE000ED28" \
    "p/x *(unsigned*)0xE000ED2C" \
    "p/x *(unsigned*)0xE000ED34" \
    "p/x *(unsigned*)0xE000ED38" \
    "bt full" \
    "info registers" \
    "frame 0"
```

Then decode CFSR/HFSR using `embed-crash/references/cortex-m-fault-registers.md`.

### 6. Mode: condition-break

For intermittent/timing bugs, create a GDB script:

```gdb
set confirm off
set pagination off
target extended-remote :3333
monitor reset halt
load
break main.c:165 if loop_counter >= 100
continue
print loop_counter
bt full
info registers
quit
```

Then run:
```bash
arm-none-eabi-gdb --batch -x /tmp/gdb_cond.gdb firmware.elf
```

More templates in `references/debug-playbook.md`.

### 7. RTOS-Aware Debugging

If RTOS is detected in Project Profile:

```bash
# FreeRTOS — get current task name
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py batch \
  --elf firmware.elf --port 3333 \
  --gdb arm-none-eabi-gdb \
  --commands \
    "p/x (char*)(((struct tskTaskControlBlock*)pxCurrentTCB)->pcTaskName)" \
    "p/x uxTaskGetNumberOfTasks()" \
    "p/x uxTaskGetStackHighWaterMark(NULL)"

# Zephyr — get current thread
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py batch \
  --elf firmware.elf --port 3333 \
  --gdb arm-zephyr-eabi-gdb \
  --commands \
    "p/x *((struct k_thread*)_kernel.current_fifo)" \
    "p/x _kernel.ready_q"
```

### 8. Release

```bash
# Reset device and disconnect
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py batch \
  --elf firmware.elf --port 3333 \
  --commands "monitor reset" "detach"

# Stop GDB server
python3 <toolkit>/skills/embed-debug/scripts/gdb_helper.py stop-server --port 3333
```

## Failure Triage

| Scenario | Category |
|----------|----------|
| GDB or GDB server not found | `environment-missing` |
| Probe not connected or device not powered | `connection-failure` |
| ELF missing or stripped (no debug symbols) | `artifact-missing` |
| GDB connects but symbols don't match device code | `target-response-abnormal` |
| Device won't halt (debug disabled, RDP level 2) | `target-response-abnormal` |
| Multiple probes detected, can't select | `ambiguous-context` |
| GDB server port already in use | `ambiguous-context` |
| Platform wrapper failed (west/idf.py/pio) | `project-config-error` |

## Platform Notes

- GDB server port conflicts: 2331 (J-Link), 3333 (OpenOCD), 4242 (ST-Link), 9000 (pyOCD)
- On macOS, ARM GDB via Homebrew at `/usr/local/bin/arm-none-eabi-gdb`
- On Linux, check `/usr/bin/arm-none-eabi-gdb` or ARM toolchain `/opt/` paths
- Zephyr: `west debug` only works from within a Zephyr workspace
- ESP-IDF: `export.sh` must be sourced first
- PlatformIO: `debug_tool` must be configured in `platformio.ini`
- GDB `set confirm off` in batch mode suppresses prompts

## Output Contract

```yaml
status: success | failure | blocked
summary: "GDB attached via OpenOCD/ST-Link. Halted at main(). 3 breakpoints set."
evidence:
  - "GDB server: openocd on port 3333 (PID 12345)"
  - "GDB: arm-none-eabi-gdb"
  - "Backtrace: main() at src/main.c:89"
failure_category: null
next_action: null (interactive) or embed-flash / embed-serial
```

## Handoff

- On successful attach: user interacts interactively, no downstream skill
- On crash diagnosis: recommend code fix → `embed-build` → `embed-flash`
- On release: recommend `embed-serial start` to monitor device output
- If platform wrapper failed: fall back to bare-metal GDB approach
