---
name: embed-workflow
description: One-click orchestration for embedded firmware — build, flash, serial verify, and diagnose in a single command. Supports quick, rebuild, and debug variants.
---

# embed-workflow — One-Click Orchestration

## When to Use

- User says "build and flash", "compile and upload", "full workflow", "just do everything"
- User wants to verify changes end-to-end without running each step manually
- User says "test it", "deploy", "ship it to board"
- Quick iteration: "re-flash" or "just flash it again"

## Required Inputs

- A workspace with a Project Profile (everything else auto-detected by each sub-skill)
- Optional: workflow variant hint (`quick`, `rebuild`, `debug`, `full`)

## Auto-Detection

This skill orchestrates other skills. It relies on each sub-skill's auto-detection. Detection sequence:
1. Run `embed_detect.js` once to get the initial Project Profile
2. Share the profile across all steps (each step may enrich it)
3. Priority: same as individual skills

## Steps

### Workflow Variants

| Variant | Trigger | Steps |
|---------|---------|-------|
| `full` (default) | "workflow", "do everything", "build and flash" | Detect → Build → Serial Start → Flash → Verify → Diag → Serial Stop |
| `quick` | "quick", "just flash", "reflash" | Serial Start → Flash → Verify → Serial Stop (skip build) |
| `rebuild` | "rebuild", "just build" | Detect → Build (stop after build) |
| `debug` | "debug workflow", "build flash debug" | Detect → Build → Flash → Debug Attach |

### Full Workflow Steps

#### Step 0: Detect
- Run `embed_detect.js` to get initial Project Profile
- Check `.embed.json` for overrides
- Report detected: build system, MCU, RTOS, probes, serial ports

#### Step 1: Build (`embed-build`)
- Execute build according to detected build system
- On failure: stop workflow, report build errors, suggest fixes
- On success: record `artifact_path` and `artifact_kind`

#### Step 2: Serial Start (`embed-serial start`)
- Start serial logger in background
- On failure (no serial port): note warning but continue (device may not need serial)
- On success: record serial PID and log path

#### Step 3: Flash (`embed-flash`)
- Flash the built artifact to device
- On failure: report flash error, suggest checking connections
- On success: wait 2 seconds for device to boot

#### Step 4: Verify
- Wait for device boot indicators in serial log (5 second timeout):
  - Shell prompt (e.g., letter-shell prompt `/ $`)
  - Boot message (e.g., "System Start", "FreeRTOS", "initialized")
  - Known log patterns from the project
- If no boot output after timeout: flag as WARN ("device may have booted but no serial output detected")

#### Step 5: Diagnose (`embed-diag quick`)
- Run basic health check over serial
- Report: serial alive, shell responding, key status indicators

#### Step 6: Serial Stop (`embed-serial stop`)
- Stop background logger
- Report log file location and size
- Offer to show filtered view if user wants

### Quick Workflow

Same as full but skip Step 1 (Build). Use when firmware is already built.

### Debug Workflow

Build → Flash → then `embed-debug attach` instead of verify+diag.

## Workflow Report

After all steps complete, print a structured summary:

```
 embed-workflow SUMMARY
══════════════════════════════════════════════
  Build:    PASS — quec_ppp_dial.elf (248KB, 3 warnings)
  Flash:    PASS — flashed in 4.2s, verified
  Serial:   PASS — /dev/cu.usbserial-1110 @115200
  Verify:   PASS — device booted (shell prompt detected)
  Diag:     PASS — PPP UP (IP 10.64.115.83), signal CSQ=20
  Log:      /tmp/embed_serial_cu.usbserial-1110.log (45KB)
══════════════════════════════════════════════
  Result:  ALL PASS (6/6)
  Time:    18.3s
```

Each step shows: PASS / FAIL / WARN / SKIP.

## Failure Triage

| Scenario | Action |
|----------|--------|
| Build fails | Stop workflow. Report errors. Do not flash. |
| Serial port not found | WARN. Continue without serial logging (flash only). |
| Flash fails | Stop workflow. Report connection/config issue. |
| Device doesn't boot after flash | WARN. Report as `target-response-abnormal`. Suggest checking serial, power, or flash verification. |
| Diag reports issues | Continue. Report diagnostic findings. |

## Platform Notes

- Workflow timing depends on build system (clean build vs incremental)
- Serial logging adds ~1s overhead for process start/stop
- Flash time varies by artifact size and probe speed

## Output Contract

```yaml
status: success | partial_success | failure
summary: "Workflow complete: 6/6 PASS. PPP connected (IP 10.64.x.x). Time: 18.3s."
project_profile:
  # Enriched profile with all discovered fields from each step
evidence:
  build: "PASS — quec_ppp_dial.elf (248KB, 3 warnings)"
  flash: "PASS — flasher debug via custom script"
  serial: "PASS — /dev/cu.usbserial-1110 @115200"
  verify: "PASS — device booted in 2.1s"
  diag: "PASS — PPP UP, signal good"
  log: "/tmp/embed_serial_cu.usbserial-1110.log (45KB)"
  duration: "18.3s"
next_action: null (workflow complete) or embed-debug (if issues found)
```

## Handoff

- All PASS: done. Log file available for review.
- Build/Flash failures: suggest fixing code or checking hardware
- Diag warnings: suggest `embed-diag full` for deeper analysis
- Crash/Fault: suggest `embed-debug crash`
