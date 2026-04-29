---
name: embed-debug
description: GDB-based firmware debugging — attach to target, set breakpoints, capture backtraces, and analyze crashes (HardFault/MemManage/BusFault) via OpenOCD, J-Link GDB Server, or pyOCD.
---

# embed-debug — GDB Firmware Debugging

## When to Use

- User says "debug", "gdb", "breakpoint", "backtrace", "step through", "attach debugger"
- After a crash or HardFault and user wants to analyze the fault
- User wants to set a breakpoint at a specific function
- Device is unresponsive and user needs to inspect registers and stack
- After flashing and user wants to step through initialization code

## Required Inputs

- A Project Profile with `artifact_path` (ELF with debug symbols required)
- A debug probe (J-Link, ST-Link, OpenOCD, pyOCD)
- Optional: breakpoint function names or addresses
- Optional: `.embed.json` overrides for `gdb_executable`, `probe_config`

## Auto-Detection

1. Check `.embed.json` for `gdb_executable`, `probe`, `probe_config`
2. Check Project Profile for `probes` and `artifact_path`
3. Run `embed_detect.js` if probe/artifact info is missing
4. Priority: user input > `.embed.json` > auto-detection > block and ask

## Steps

### Modes

| Mode | Trigger Phrases | Description |
|------|----------------|-------------|
| `attach` | "attach", "connect", "start debugging" | Start GDB server, connect GDB client, halt at main |
| `break` | "breakpoint", "break at", "stop at" | Set breakpoint at function/address and continue |
| `backtrace` | "backtrace", "bt", "stack", "call stack" | Capture current stack trace |
| `crash` | "crash", "hard fault", "bus fault", "mem fault", "exception" | Analyze fault registers and stack after a crash |
| `release` | "disconnect", "detach", "stop debugging", "reset and run" | Detach GDB, reset device, continue normal execution |

### Mode: `attach`

1. **Select GDB executable**: `arm-none-eabi-gdb` (most common), `gdb-multiarch`, or from `.embed.json`
2. **Select GDB server** based on probe:
   - **OpenOCD**: `openocd -f <interface.cfg> -f <target.cfg>`
   - **J-Link**: `JLinkGDBServer -device <mcu> -if SWD -speed 4000 -port 2331`
   - **pyOCD**: `pyocd gdbserver -t <target>`
   - **ST-Link**: `st-util` (starts GDB server on :4242)
3. **Start GDB server** in background, wait for it to be ready (check port open)
4. **Connect GDB client**:
   ```
   arm-none-eabi-gdb <elf> -ex "target extended-remote :<port>" -ex "monitor reset halt" -ex "b main"
   ```
5. Report server PID, port, and GDB status

### Mode: `break`

1. Ensure GDB server is running (or start `attach` first)
2. Set breakpoint: `arm-none-eabi-gdb <elf> -ex "target extended-remote :<port>" -ex "b <function>" -ex "c"`
3. Wait for breakpoint hit, then show registers and surrounding code

### Mode: `backtrace`

1. Connect GDB (batch mode) and run:
   ```
   arm-none-eabi-gdb <elf> -batch -ex "target extended-remote :<port>" -ex "bt" -ex "info registers" -ex "frame"
   ```
2. Parse and present the backtrace with function names, file locations, and line numbers

### Mode: `crash`

For Cortex-M HardFault analysis:

1. Connect GDB and read fault registers:
   ```
   arm-none-eabi-gdb <elf> -batch -ex "target extended-remote :<port>" \
     -ex "p/x *(unsigned*)0xE000ED28"  \  # CFSR (Configurable Fault Status Register)
     -ex "p/x *(unsigned*)0xE000ED2C"  \  # HFSR (HardFault Status Register)
     -ex "p/x *(unsigned*)0xE000ED34"  \  # MMFAR (MemManage Fault Address Register)
     -ex "p/x *(unsigned*)0xE000ED38"  \  # BFAR (BusFault Address Register)
     -ex "bt"                           \  # Backtrace
     -ex "info registers"
   ```
2. Decode fault bits:
   - **CFSR bits**: divide-by-zero, unaligned access, bus fault, memory management fault, usage fault
   - **HFSR bits**: forced hard fault, vectored bus fault
3. Present diagnosis:
   - Fault type (HardFault/MemManage/BusFault/UsageFault)
   - Faulting address (if available from BFAR/MMFAR)
   - Call stack at time of fault
   - Most likely cause (null pointer, stack overflow, unaligned access, etc.)
4. Recommend fixes based on fault type

### Mode: `release`

1. Reset device: `monitor reset` or `monitor reset halt` then `c`
2. Disconnect GDB: `detach`, `quit`
3. Stop GDB server (kill PID)
4. Report device released and running normally

## Failure Triage

| Scenario | Category |
|----------|----------|
| `arm-none-eabi-gdb` not found | `environment-missing` |
| GDB server tool (openocd/JLinkGDBServer) not found | `environment-missing` |
| Probe not connected | `connection-failure` |
| ELF missing or stripped (no debug symbols) | `artifact-missing` |
| GDB connects but symbols don't match device code | `target-response-abnormal` |
| Device won't halt (running code that disables debug) | `target-response-abnormal` |
| Multiple probes, can't select | `ambiguous-context` |

## Platform Notes

- GDB server port conflicts: check if ports 2331 (J-Link), 3333 (OpenOCD), 4242 (ST-Link), 9000 (pyOCD) are free
- On macOS, ARM GDB is typically at `/usr/local/arm-none-eabi/bin/arm-none-eabi-gdb`
- On Linux, `/usr/bin/arm-none-eabi-gdb` or from ARM toolchain install
- GDB may need `set confirm off` in batch mode to suppress prompts

## Output Contract

```yaml
status: success | failure | blocked
summary: "HardFault analyzed: BusFault at 0x20001000 (unaligned access). Stack: quec_ppp_send() -> pppos_output_cb(). Likely: buffer pointer misaligned."
project_profile:
  gdb_executable: /usr/local/arm-none-eabi/bin/arm-none-eabi-gdb
  probe: jlink
evidence:
  - "CFSR: 0x00008200 (BFARVALID + PRECISERR)"
  - "BFAR: 0x20001000"
  - "Backtrace: quec_ppp_send at quec_ppp.c:342"
next_action: embed-build (after fixing code) or embed-workflow (to re-test)
```

## Handoff

- On crash diagnosis: recommend code changes, then `embed-build` → `embed-flash`
- On successful attach: user interacts with GDB session interactively
- On release: recommend `embed-serial start` to monitor device output
