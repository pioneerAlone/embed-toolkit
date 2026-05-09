# Toolchain Prefix Reference

All supported embedded GCC toolchains produce standard ELF files. The only difference is the tool prefix.

## Prefix by Platform

| Platform | Tool Prefix | Typical Project |
|----------|-------------|-----------------|
| ARM GCC (bare-metal) | `arm-none-eabi-` | STM32 (CubeMX), NXP (MCUXpresso), TI, nRF, GigaDevice, AT32, HC32, MM32 |
| Zephyr ARM | `arm-zephyr-eabi-` | Zephyr on STM32/nRF/NXP |
| Zephyr RISC-V | `riscv64-zephyr-elf-` | Zephyr on RISC-V |
| ESP-IDF Xtensa | `xtensa-esp32-elf-` | ESP32, ESP32-S2, ESP32-S3 |
| ESP-IDF Xtensa LX6 | `xtensa-esp32s2-elf-` | ESP32-S2 specific |
| ESP-IDF Xtensa LX7 | `xtensa-esp32s3-elf-` | ESP32-S3 specific |
| ESP-IDF RISC-V | `riscv32-esp-elf-` | ESP32-C2, ESP32-C3, ESP32-C6, ESP32-H2 |
| RISC-V (bare-metal) | `riscv-none-embed-` | GD32VF103, CH32V307, BL602 |
| RISC-V 64 | `riscv64-unknown-elf-` | SiFive, Kendryte K230 |

## Detection Priority

1. **Project Profile** — `toolchain` field, if set
2. **Build config** — parse `CMakeCache.txt` for `CMAKE_C_COMPILER`, or `.config` for `CONFIG_TOOLCHAIN_PREFIX` (Zephyr), or `sdkconfig` for ESP-IDF
3. **PATH scan** — search for `*-gcc` or `*-gdb` in PATH, match against known prefixes
4. **Workspace clues** — `west.yml` → Zephyr, `CMakeLists.txt` with `find_package(Zephyr)` → Zephyr, `sdkconfig` → ESP-IDF

## addr2line Availability

All platforms support `addr2line` with identical arguments:

```bash
${PREFIX}addr2line -e firmware.elf -afpiC <address1> <address2> ...
```

- `-a` — show addresses in output
- `-f` — show function names
- `-p` — pretty-print (file:line on single line)
- `-i` — inlines (show inline function chain)
- `-C` — demangle C++ names

## objdump Fallback

If `addr2line` is unavailable, use:

```bash
${PREFIX}objdump -d -S firmware.elf | grep -A5 <address>
```

## Common PATH Locations

| Host OS | ARM GCC Path |
|---------|-------------|
| macOS (Homebrew) | `/usr/local/bin/arm-none-eabi-*` |
| Linux (apt) | `/usr/bin/arm-none-eabi-*` |
| Linux (manual) | `/opt/gcc-arm-none-eabi-*/bin/` |
| Windows (installer) | `C:\Program Files (x86)\GNU Arm Embedded Toolchain\*\bin\` |
| ESP-IDF | `$IDF_PATH/../.espressif/tools/xtensa-esp32-elf/` |
| Zephyr SDK | `$ZEPHYR_SDK_INSTALL_DIR/arm-zephyr-eabi/bin/` |
