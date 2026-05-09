# Platform-Specific Debug Entry Points

Some build platforms provide their own debug wrappers. Use these when the project was set up with them — they handle toolchain prefix, GDB server, and target config automatically.

## Zephyr: `west debug`

```bash
# Start debug session (auto-starts GDB server)
west debug

# With specific runner (override auto-detection)
west debug --runner jlink
west debug --runner openocd
west debug --runner pyocd

# GDB only (no server — connect to already-running server)
west debug --runner jlink --gdb-only
```

**How it works**: `west debug` reads `.config` for `CONFIG_DEBUG_RUNNER`, locates the ELF at `build/zephyr/zephyr.elf`, starts the appropriate GDB server, and launches GDB connected to it.

**Toolchain prefix**: `arm-zephyr-eabi-` or `riscv64-zephyr-elf-`.

## ESP-IDF: `idf.py gdb`

```bash
# One-shot GDB session (starts OpenOCD automatically, connects, drops to GDB prompt)
idf.py gdb

# GDB with specific commands (batch mode)
idf.py gdb --batch -ex "bt full" -ex "quit"

# OpenOCD only (for manual GDB connection)
idf.py openocd
# Then in another terminal:
xtensa-esp32-elf-gdb build/firmware.elf -ex "target extended-remote :3333"

# For JTAG debugging (ESP32-S3 with USB-JTAG):
idf.py openocd --openocd-commands "adapter speed 20000"
```

**Toolchain prefix**: `xtensa-esp32-elf-` (ESP32/S2/S3) or `riscv32-esp-elf-` (ESP32-C2/C3/C6/H2).

**Note**: ESP-IDF debug requires `OPENOCD_SCRIPTS` to be set (done by `export.sh`). For built-in USB-JTAG on ESP32-C3/S3, use the `esp_usb_jtag` interface.

## PlatformIO: `pio debug`

```bash
# Start debug session (auto-manages GDB server)
pio debug

# With specific environment
pio debug -e esp32dev

# GDB only (connect to already-running server)
pio debug --interface=gdb
```

**How it works**: PlatformIO reads `platformio.ini` for `debug_tool`, automatically starts the right GDB server (OpenOCD/pyOCD/J-Link), and connects GDB. The ELF is at `.pio/build/<env>/firmware.elf`.

**Toolchain prefix**: PlatformIO manages this — typically `arm-none-eabi-` for ARM or `xtensa-esp32-elf-` for ESP32.

## ARM GCC (bare-metal / CubeMX / MCUXpresso)

No wrapper — use GDB directly with the right GDB server.

```bash
# 1. Start GDB server (choose one)
openocd -f interface/stlink.cfg -f target/stm32f4x.cfg &
# or
JLinkGDBServer -device STM32F407VG -if SWD -speed 4000 &
# or
st-util -p 4242 &
# or
pyocd gdbserver -t stm32f407vg &

# 2. Connect GDB
arm-none-eabi-gdb firmware.elf \
  -ex "target extended-remote :3333" \
  -ex "monitor reset halt"
```

**Toolchain prefix**: `arm-none-eabi-`.

## RISC-V (bare-metal)

```bash
# OpenOCD with RISC-V target
openocd -f interface/cmsis-dap.cfg -f target/gd32vf103.cfg &

# GDB
riscv-none-embed-gdb firmware.elf -ex "target extended-remote :3333"
```

**Toolchain prefix**: `riscv-none-embed-` or `riscv64-unknown-elf-`.

## Detection Priority

When a project is detected:

1. **Check build system** from Project Profile
2. **Check for platform wrapper**:
   - `west` in PATH + `west.yml` in workspace → use `west debug`
   - `idf.py` in PATH + `sdkconfig` in workspace → use `idf.py gdb`
   - `platformio.ini` in workspace → use `pio debug`
   - Otherwise → use bare-metal GDB + probe

3. **Resolve toolchain prefix** from `references/toolchain-prefix.md` in embed-crash (same reference applies)
