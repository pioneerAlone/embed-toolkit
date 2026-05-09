---
name: embed-crash
description: Analyze MCU crash dumps — decode fault registers, reconstruct stack traces from serial output or dump files, and resolve addresses to source locations.
---

# embed-crash — Firmware Crash Analysis

## When to Use

- User says "it crashed", "HardFault", "BusFault", "MemManage", "UsageFault", "exception", "core dump"
- User pastes serial output containing a fault dump (registers + stack bytes)
- User has a crash dump file from CrashCatcher/CmBacktrace or a GDB `info all-registers` output
- User wants to know WHY the MCU crashed and WHERE in the code

## Required Inputs

**Minimum (Tier 1 — basic address lookup):**
- PC value at fault (hex address)
- ELF file path

**Better (Tier 2 — full diagnosis):**
- PC, LR, SP values
- Fault status registers: CFSR, HFSR (and MMFAR/BFAR if relevant)
- Stack memory hex dump (e.g., 32 words from SP)
- ELF file path

**Best (Tier 3 — GDB post-mortem):**
- Complete RAM dump file (CrashCatcher format, or GDB-generated)
- ELF file path

## Auto-Detection

1. Read Project Profile for `target_mcu`, `target_core`, `toolchain`, and `rtos`
2. Determine Cortex-M variant (M0/M0+/M3/M4/M7/M23/M33) — this determines which fault registers exist
3. Detect toolchain prefix from PATH or build config (see `references/toolchain-prefix.md`)
4. Search workspace for ELF files in `build/`, `armgcc/*/`, `Debug/`, `Release/`, `.pio/build/`
5. If user pasted serial output, auto-parse register values and stack bytes from the text
6. Priority: user-provided ELF path > Project Profile > auto-scan > ask user

## Steps

### 1. Detect Target and Toolchain

From Project Profile, determine:
- **Core type**: Cortex-M0/M0+ (basic HardFault only), M3/M4/M7 (full fault regs), M23/M33 (ARMv8-M with SecureFault)
- **Toolchain prefix**: e.g., `arm-none-eabi-`, `arm-zephyr-eabi-`, `xtensa-esp32-elf-`, `riscv32-esp-elf-`
- **Available tools**: `addr2line`, `gdb`, `objdump`

Use `references/toolchain-prefix.md` for the full prefix lookup table.

### 2. Collect Crash Information (Interactive)

Guide the user based on what they have. Ask ONLY for the next useful piece, don't demand everything at once.

**Round 1**: "Please paste the crash output from your serial console, or specify a crash dump file path."

If the pasted text contains `PC =` or `pc:` or `PC:` — extract the address and proceed to analysis.

**Round 2** (if only PC was found): "I found the crash PC address. To get a full diagnosis, additional info helps:
- Do you have the LR and SP values?
- Or a complete register dump?
- Or the hex bytes from the stack area?"

**Round 3** (if ELF not found): "Which ELF file should I use? Auto-detected candidates:
  1. ./build/firmware.elf
  2. ./armgcc/debug/firmware.elf
  Or specify another path."

Never demand all information upfront — each round adds value. Even just PC + ELF gives a useful result.

### 3. Decode Fault Registers

If CFSR/HFSR values are available, decode them using the bit definitions in `references/cortex-m-fault-registers.md`.

**CFSR breakdown** (from [references/cortex-m-fault-registers.md](references/cortex-m-fault-registers.md)):

| Register | Bits in CFSR | Meaning |
|----------|-------------|---------|
| UFSR | [15:8] | UsageFault: undefined instruction, divide-by-zero, unaligned access, no coprocessor |
| BFSR | [7:0] | BusFault: PRECISERR (bus fault at known address in BFAR), IMPRECISERR, STKERR, UNSTKERR |
| MMFSR | [7:0] in MMFSR | MemManage: IACCVIOL, DACCVIOL, MUNSTKERR, MSTKERR, MLSPERR (M33: MMar 未对齐) |

**HFSR breakdown:**
- `[30]` FORCED — this HardFault was escalated from another fault
- `[1]` VECTTBL — vector table read fault (bad boot vector)

**Important**: On Cortex-M0/M0+, only HardFault exists (HFSR only). CFSR/BFAR/MMFAR don't exist.

Decode to natural language, e.g.:
> CFSR=0x00008200 → UsageFault: divide-by-zero (UFSR bit 25). No BusFault or MemManage fault active.

### 4. Reconstruct Stack Trace

If stack memory hex is provided:

1. **Compute SP at fault**: If SP was in the dump, use it. Otherwise estimate from context.
2. **Read return addresses from stack frame**: The Cortex-M exception frame layout (from SP):
   ```
   SP+0:  R0
   SP+4:  R1
   SP+8:  R2
   SP+12: R3
   SP+16: R12
   SP+20: LR
   SP+24: PC (return address)
   SP+28: xPSR
   ```
3. **Walk the call chain backward**: Start from the exception frame's LR/PC, then use the link register chain to walk up.

For RTOS tasks (FreeRTOS/Zephyr):
- The TCB contains `pxTopOfStack` — the saved SP for each task
- Search the dumped memory for TCB structures to find crashed task name

### 5. Symbolize Addresses

For each extracted address, run:

```bash
${TOOLCHAIN_PREFIX}addr2line -e firmware.elf -afpiC <address1> <address2> ...
```

Output format: `address: source_file:line_number: function_name`

If `addr2line` is not available, fall back to:
```bash
${TOOLCHAIN_PREFIX}objdump -d -S firmware.elf | grep -A5 <address>
```

Or use GDB:
```bash
${TOOLCHAIN_PREFIX}gdb -batch -ex "info line *<address>" firmware.elf
```

### 6. GDB Post-Mortem (Tier 3 only)

When a complete crash dump file is available (CrashCatcher format or GDB-generated):

```bash
${TOOLCHAIN_PREFIX}gdb firmware.elf \
  -ex "set target-charset ASCII" \
  -ex "target remote | python3 ${TOOLKIT_DIR}/skills/embed-crash/scripts/crash_analyzer.py gdb-stub --dump <crash_dump_file>" \
  -ex "bt full" \
  -ex "info locals" \
  -ex "info registers" \
  -ex "frame 0" \
  -ex "quit"
```

The `crash_analyzer.py gdb-stub` mode presents the crash dump to GDB as if it were a live target.

### 7. Produce Diagnostic Report

Output a structured YAML report:

- **Fault type**: Human-readable (e.g., "BusFault: PRECISERR — attempted write to invalid address 0xE0003000")
- **Crash location**: source_file:line:function
- **Call stack**: full backtrace with source-level annotation
- **Probable root cause**: "divide-by-zero in sensor_calibrate()", "NULL pointer dereference in UART ISR", "stack overflow in logger_task"
- **Next steps**: suggested fix, or further debugging actions

## Failure Triage

| Scenario | Category |
|----------|----------|
| `addr2line` or `gdb` not found for detected toolchain | `environment-missing` |
| ELF file missing or not matching the crash addresses | `artifact-missing` |
| Crash dump has no recognizable PC value | `ambiguous-context` |
| Stack bytes provided but address ranges are outside valid RAM | `ambiguous-context` |
| Fault registers indicate attack/security violation (SecureFault on M33) | `ambiguous-context` |

## Platform Notes

- Cortex-M0/M0+: Only HardFault available. No CFSR, no MMFAR/BFAR. Analysis is limited to PC + stack walk.
- Cortex-M23/M33 (ARMv8-M): Additional SecureFault register. TrustZone-aware debugging.
- ESP32 Xtensa: Uses `xtensa-esp32-elf-` prefix. Exception frame layout differs from ARM (Xtensa has windowed registers). See ESP-IDF `panic.c` output format.
- RISC-V: Uses `mcause`/`mepc`/`mtval` registers instead of CFSR/HFSR. Exception frame layout differs.

## Output Contract

```yaml
status: success | partial_success | blocked | failure
summary: "UsageFault: divide-by-zero in sensor_calibrate() at src/sensor.c:142. Called from main_loop() at src/main.c:89."
evidence:
  - "PC: 0x08001D9C → src/sensor.c:142 (sensor_calibrate)"
  - "LR: 0x08001234 → src/main.c:89 (main_loop)"
  - "CFSR: 0x00008200 → UsageFault: divide-by-zero (UFSR bit 25)"
  - "Stack trace: main_loop→sensor_read→sensor_calibrate→DIV0"
next_action: "Check division by variable that may be zero in sensor_calibrate()"
failure_category: null
```

## Handoff

- On success: report is self-contained. User may need to fix source code.
- If root cause unclear from registers alone: suggest `embed-debug` with hardware attached
- If crash is in third-party library / BSP code: suggest checking library version or known issues
