# Debug Playbook

Decision tree, condition breakpoint patterns, and anti-patterns for embedded firmware debugging.

## Decision Tree

```
User reports: "crashed", "freezes", "hanging", "not working"
    │
    ├─ Device is still attached to debug probe?
    │   └─ YES → Use embed-debug (this skill)
    │
    ├─ Only have serial crash dump output?
    │   └─ YES → Use embed-crash (offline analysis, no hardware needed)
    │
    ├─ Reproducible crash at known point?
    │   ├─ Known function/file → GDB breakpoint, then step
    │   ├─ Loop-related (N-th iteration crash) → GDB condition breakpoint `break file:line if loop >= N`
    │   ├─ Timing-dependent → GDB condition breakpoint `break file:line if HAL_GetTick() > T`
    │   ├─ Pointer/address related → GDB condition breakpoint `break file:line if ptr == NULL`
    │   └─ Data corruption (wrong values) → GDB watchpoint `watch variable`
    │
    ├─ Random/intermittent crash?
    │   ├─ Suspect stack overflow → GDB read stack watermark / check MPU faults
    │   ├─ Suspect race condition → OpenOCD Telnet `halt; reg pc` (quick check)
    │   └─ Suspect peripheral issue → Read peripheral registers via GDB `p/x *(uint32_t*)0x40000000`
    │
    └─ Device freezes (no crash)?
        ├─ Halt with GDB, read PC → find where it's stuck
        ├─ RTOS? → Read task list and states (see RTOS-aware section)
        └─ Check for infinite loop or deadlock
```

## Method Selection Table

| Problem Type | Method | Command Template |
|-------------|--------|-----------------|
| Loop N-th crash | Condition breakpoint | `break file:line if loop_counter >= N` |
| Timing crash | Condition breakpoint | `break file:line if HAL_GetTick() > N` |
| Pointer crash | Condition breakpoint | `break file:line if ptr == NULL` |
| Data corruption | Watchpoint | `watch variable` then `continue` |
| Step through logic | Normal breakpoint | `break file:line` then `stepi` / `next` |
| Quick liveness check | OpenOCD/Probe Telnet | `halt`, `reg pc`, `resume` |
| Unknown crash | Halt + bt + fault regs | `bt full`, `info registers`, read CFSR/HFSR |
| Stack overflow | Read SP, check against stack limits | `p/x $sp`, compare with .map / linker script |
| RTOS task hung | Read task list via GDB | `pxCurrentTCB` → task states |

## Condition Breakpoint Templates

```gdb
# Loop counter
break main.c:100 if loop_count >= 100

# NULL pointer
break driver.c:50 if rx_buffer == 0

# Error code
break hal_i2c.c:75 if error_code != 0

# Tick-based timing
break task.c:200 if HAL_GetTick() > 10000

# Specific value match
break sensor.c:30 if raw_value > 4000

# Combined conditions
break isr.c:12 if count > 10 && error_flag == 1
```

## GDB Batch Mode - Condition Breakpoint Script

```bash
cat > /tmp/gdb_cond.gdb << 'EOF'
set confirm off
set pagination off
target extended-remote :3333
monitor reset halt
load
break main.c:165 if loop_counter >= 100
continue
print loop_counter
backtrace full
info registers
quit
EOF

arm-none-eabi-gdb --batch -x /tmp/gdb_cond.gdb firmware.elf
```

## Watchpoint Patterns

```gdb
# Hardware watchpoint (max 4-6 on Cortex-M)
watch g_error_count          # break when variable changes
watch *0x20001000            # watch memory address
rwatch *0x20001000           # break on read
awatch *0x20001000           # break on read or write

# Condition watchpoint
watch g_error_count if g_error_count > 10
```

## RTOS-Aware Debug (FreeRTOS via GDB)

When RTOS is detected, read task info directly from GDB without needing OpenOCD RTOS awareness:

```gdb
# Get current task
p/x *(pxCurrentTCB)

# Get task name (FreeRTOS)
p/x ((struct tskTaskControlBlock*)pxCurrentTCB)->pcTaskName

# Get task list — iterate pxReadyTasksLists, pxDelayedTaskList, etc.
# Get stack high watermark
p/x uxTaskGetStackHighWaterMark(NULL)
```

For Zephyr:
```gdb
p/x *((struct k_thread*)_kernel.current_fifo)
p/x _kernel.ready_q
```

## Probe-Specific Quick Checks

### OpenOCD Telnet (fastest liveness check)

```bash
echo -e "halt\nreg pc\nresume\nexit" | nc localhost 4444
```

### J-Link Commander

```bash
echo -e "connect\nh\nregs\nexit" | JLinkExe -device STM32F407VG -if SWD -speed 4000 -autoconnect 1
```

## Anti-Patterns (Avoid These)

1. **OpenOCD Telnet for iterative debugging** — Use GDB condition breakpoints instead of repeatedly halting/checking/resuming
2. **Debugging with HEX/BIN** — No symbols; always use ELF with `-g` (debug build)
3. **Release build debugging** — `-O2`/`-Os` inlines and reorders code; use `-Og` or `-O0` for debugging
4. **Not checking if GDB server is already running** — Check port (2331/3333/4242) before starting a second instance
5. **Forgetting to halt before reading registers** — Running target gives stale register values
6. **Using `stepi` through library code** — Use `finish` to return, `until line` to skip ahead
7. **Not saving crash context** — Before resetting after a crash, always `bt full` + `info registers` + read fault registers

## Volatile Debug Variables (In-Code Helpers)

```c
// Add to your code for non-intrusive debugging
volatile uint32_t dbg_loop_count = 0;
volatile uint32_t dbg_last_error = 0;
volatile uint32_t dbg_state = 0;  // track state machine position

// Find their addresses for watchpoints:
// arm-none-eabi-nm firmware.elf | grep dbg_
```

## GDB Server Port Reference

| Probe | Default Port | Config |
|-------|-------------|--------|
| OpenOCD GDB | 3333 | `-c "gdb_port 3333"` |
| OpenOCD Telnet | 4444 | `-c "telnet_port 4444"` |
| J-Link GDB | 2331 | `-port 2331` |
| ST-Link (st-util) | 4242 | `-p 4242` |
| pyOCD | 3333 | `-p 3333` |
