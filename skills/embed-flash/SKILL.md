---
name: embed-flash
description: Flash firmware to target device — automatically detects programming method (OpenOCD, J-Link, pyOCD, or custom script) and programs the MCU.
---

# embed-flash — Universal Firmware Flash

## When to Use

- User says "flash", "program", "burn", or "upload firmware"
- After a successful build
- Part of `/embed-workflow` orchestration
- User wants to re-flash without rebuilding

## Required Inputs

- A Project Profile with `workspace_root` and `artifact_path` (or a known firmware artifact to flash)
- If artifact is missing: run `embed-build` first, or ask user for the path
- Optional: `probe`, `probe_config`, `flash_cmd` from `.embed.json`

## Auto-Detection

1. Check `.embed.json` for `flash_cmd` or `flash_method` overrides
2. Check Project Profile for `artifact_path` and `probes`
3. Run `embed_detect.js` if probe info is missing
4. Priority: user input > `.embed.json` > auto-detection > block and ask

## Steps

### 1. Verify Artifact

Check that `artifact_path` exists and is a valid file.
- ELF: ready to flash
- HEX: ready to flash
- BIN: require a base address (block if unknown); common Cortex-M default is `0x08000000` for STM32, `0x08000000` for NXP — **ask user if not explicit**

### 2. Detect Flash Method

| Method | Detection | Action |
|--------|-----------|--------|
| Custom script | `.embed.json` `flash_cmd` or detected `custom_flash_detected` | Execute the script directly |
| OpenOCD | `openocd` in PATH + board/probe config found | `openocd -f <interface.cfg> -f <target.cfg> -c "program <elf> verify reset exit"` |
| J-Link | `JLinkExe` in PATH | Create a temp J-Link command script, then `JLinkExe -device <mcu> -if SWD -speed 4000 -autoconnect 1 -CommanderScript <script>` |
| pyOCD | `pyocd` in PATH | `pyocd flash -t <target> <elf>` |
| ST-Link | `st-flash` in PATH | `st-flash write <bin> <base_addr>` |

### 3. Execute Flash

- Run the flash command
- Parse output for success indicators: "verified OK", "Flash completed", "Programming done", exit code 0
- Parse output for failure indicators: "Error", "FAIL", "timeout", non-zero exit code

### 4. Verify Flash

If the flash tool supports it, verify the written firmware matches the artifact. If not, note that verification was skipped.

### 5. Reset Device

After successful flash, reset the target if the flash tool didn't already.

### 6. Report

- Flash method used
- Device/probe detected
- Flash duration
- Verification result
- Update Project Profile with `probe` and `flash_method` fields

## Failure Triage

| Scenario | Category |
|----------|----------|
| Flash tool (openocd/JLinkExe/pyocd) not found | `environment-missing` |
| Probe not connected or not detected | `connection-failure` |
| Artifact file missing or wrong format | `artifact-missing` |
| Flash succeeds but verification fails | `target-response-abnormal` |
| Multiple probes detected, can't choose | `ambiguous-context` |
| USB device permission denied (Linux) | `permission-problem` |
| Device not responding to reset | `target-response-abnormal` |

## Platform Notes

- **Linux**: J-Link requires udev rules for USB access. OpenOCD needs `-c "adapter driver <xyz>"` matching the probe.
- **macOS**: Probe access issues show as "device not found"; check USB connection physically.
- **Windows**: J-Link and ST-Link require driver installation. COM ports for serial-based flashing must be free.

## Output Contract

```yaml
status: success | failure | blocked
summary: "Flashed quec_ppp_dial.elf via custom script (flash_debug.sh), verification OK"
project_profile:
  probe: custom_script
  flash_method: custom_script
  flash_cmd: ./scripts/flash_debug.sh
evidence:
  - "Flash script: ./scripts/flash_debug.sh"
  - "Artifact: armgcc/flash_debug/quec_ppp_dial.elf (248KB)"
  - "Result: Flash successful, device reset"
next_action: embed-serial
```

## Handoff

- On success: recommend `embed-serial start` to monitor device output
- On success with debug intent: recommend `embed-debug attach`
- On failure: report failure category and recommend diagnostic steps
