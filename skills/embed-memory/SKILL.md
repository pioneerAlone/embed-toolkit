---
name: embed-memory
description: Analyze firmware memory usage — parse .map or ELF to report Flash/RAM usage, symbol sizes, and compare builds.
---

# embed-memory — Firmware Memory Analysis

## When to Use

- User asks "how much flash/ram is used", "memory report", "symbol sizes", "what's taking space"
- After a build, to check if firmware fits in chip memory limits
- After a build, to see what grew compared to a previous build
- Before optimizing code size, to find the biggest functions/objects
- To verify stack sizes from `.map` file

## Required Inputs

- `.map` file path, or ELF file path, or a build directory (auto-searched)
- Optional: linker script `.ld` path (for total capacity — improves usage% accuracy)
- Optional: previous `.map` or ELF for diff/comparison
- Optional: `--top N` to limit symbol ranking (default 20)

## Auto-Detection

1. Check `.embed.json` for `artifact_path` or `map_path` overrides
2. Scan `build/`, `armgcc/*/`, `Debug/`, `Release/`, `.pio/build/` for `.map` and `.elf` files
3. If linker script not provided, search workspace for `.ld` files
4. Priority: user input > `.embed.json` > auto-detect > ask user
5. Toolchain prefix detected from Project Profile `toolchain` field or PATH

## Steps

### 1. Locate Analysis Targets

Search for files in this order:
- User-specified file paths
- `artifact_path` from Project Profile
- Auto-scan build directories

Prefer `.map` over ELF for memory region analysis (`.map` contains explicit region boundaries). Prefer ELF over `.map` for symbol size ranking (ELF always has accurate sizes).

### 2. Detect Toolchain Tools

Based on `toolchain` in Project Profile, find the right-prefixed tools:

| Platform | `size` | `objdump` | `nm` | `readelf` |
|----------|--------|-----------|------|-----------|
| ARM GCC | `arm-none-eabi-size` | `arm-none-eabi-objdump` | `arm-none-eabi-nm` | `arm-none-eabi-readelf` |
| Zephyr ARM | `arm-zephyr-eabi-size` | `arm-zephyr-eabi-objdump` | `arm-zephyr-eabi-nm` | `arm-zephyr-eabi-readelf` |
| ESP-IDF Xtensa | `xtensa-esp32-elf-size` | `xtensa-esp32-elf-objdump` | `xtensa-esp32-elf-nm` | `xtensa-esp32-elf-readelf` |
| ESP-IDF RISC-V | `riscv32-esp-elf-size` | `riscv32-esp-elf-objdump` | `riscv32-esp-elf-nm` | `riscv32-esp-elf-readelf` |
| RISC-V | `riscv-none-embed-size` | `riscv-none-embed-objdump` | `riscv-none-embed-nm` | `riscv-none-embed-readelf` |

Auto-detect by searching PATH for `*-size` matching the platform. If not found, fall back to system `size`/`objdump` (may not work for cross-compiled ELF).

### 3. Run Memory Analysis

**From `.map` file:**

Parse the `Memory Configuration` block to get region names, base addresses, and total sizes:
```
Memory Configuration

Name             Origin             Length
FLASH            0x08000000         0x00100000
RAM              0x20000000         0x00040000
```

Then find usage from the bottom of the `.map` — look for `Total ROM` / `Total RW` or sum section fill percentages manually from the section listing.

**From ELF file (fallback when no .map):**

```bash
${PREFIX}size -A firmware.elf       # section-by-section sizes
${PREFIX}readelf -S firmware.elf    # full section table
${PREFIX}nm --print-size --size-sort --radix=d firmware.elf | tail -20  # top symbols
```

### 4. Symbol Size Ranking

```bash
# Top N largest symbols (data + code combined)
${PREFIX}nm --print-size --size-sort --radix=d firmware.elf | tail -N

# Or from .map: extract .text and .data sections, sort by size
```

Group results by:
- `[T]` — code (.text)
- `[D]` — initialized data (.data)
- `[B]` — uninitialized data (.bss)
- `[R]` — read-only data (.rodata)

### 5. Stack Estimation (if RTOS detected)

For FreeRTOS/Zephyr/RT-Thread projects:
- Search `.map` for `uxTaskGetStackHighWaterMark` / `*stack*` / `*Stack*` symbols
- Extract task stack sizes from `.map` (e.g., `uxStackSize`, `configMINIMAL_STACK_SIZE` constants)
- Report per-task stack allocation vs usage

### 6. Build Diff (if previous artifact provided)

```bash
# Compare ELF section sizes
diff <(${PREFIX}size -A old_firmware.elf) <(${PREFIX}size -A new_firmware.elf)

# Compare top symbols
comm -3 <(${PREFIX}nm --print-size --size-sort old.elf | tail -30) \
        <(${PREFIX}nm --print-size --size-sort new.elf | tail -30)
```

Report: which sections grew, which symbols changed most, net delta.

### 7. Report

Format output as a structured report:
- **Summary**: total Flash/RAM usage, usage%, remaining space
- **Warning**: if usage exceeds 90% — flag it
- **Top symbols**: ranked list with source file hints via `addr2line`
- **Diff**: if comparison was run
- **Recommendations**: if close to limits, suggest optimization targets

## Failure Triage

| Scenario | Category |
|----------|----------|
| No `.map` or ELF found in workspace | `artifact-missing` |
| Toolchain tools (`size`, `nm`, `readelf`) not found | `environment-missing` |
| ELF is stripped (no debug symbols) | `artifact-missing` |
| `.map` has unexpected format (e.g., IAR/Keil format) | `ambiguous-context` |
| Linker script not found, can't calculate usage% | `ambiguous-context` |

## Platform Notes

- macOS: `arm-none-eabi-*` tools from Homebrew at `/usr/local/bin/`
- Linux: tools at `/usr/bin/` or `/opt/gcc-arm-none-eabi/bin/`
- Windows: tools at `C:\Program Files (x86)\GNU Arm Embedded Toolchain\*\bin\`
- ESP-IDF: run `. $IDF_PATH/export.sh` first to set up PATH

## Output Contract

```yaml
status: success | partial_success | blocked | failure
summary: "Flash: 248KB/512KB (48.4%), RAM: 72KB/128KB (56.3%). Top: HAL_UART_Transmit (824B)"
project_profile:
  flash_used: "248KB"
  flash_total: "512KB"
  ram_used: "72KB"
  ram_total: "128KB"
evidence:
  - "arm-none-eabi-size -A firmware.elf"
  - "arm-none-eabi-nm --print-size --size-sort firmware.elf"
next_action: none
```

## Handoff

- On success: report is self-contained, no downstream skill required
- If memory near limit: suggest optimization or review linker script
- If unusual symbol growth detected: suggest `embed-build` fresh build and re-check
