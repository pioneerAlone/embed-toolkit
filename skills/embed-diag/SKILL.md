---
name: embed-diag
description: Runtime diagnostics for embedded devices — send shell/AT commands over serial, perform health checks, and analyze device state (RTOS tasks, heap, network, peripherals).
---

# embed-diag — Runtime Diagnostics

## When to Use

- User says "diagnose", "health check", "status", "what's wrong", "check device", "send AT command"
- After flashing, to verify device is running correctly
- PPP/network connection issues
- Device seems stuck or unresponsive
- User wants to query modem status, signal strength, registration
- Part of `/embed-workflow` orchestration

## Required Inputs

- Active serial connection (from `embed-serial start`) or serial port info from Project Profile
- Optional: known shell commands, AT commands, or diagnostic procedures
- Optional: `.embed.json` overrides for `shell_commands`

## Auto-Detection

1. Check `.embed.json` for `shell_commands` list
2. Check serial log for known shell prompts (e.g., `letter-shell` prompt pattern)
3. Scan project source for `SHELL_EXPORT_CMD` macros to discover available commands
4. Priority: user input > `.embed.json` > auto-detection > ask user

## Steps

### Modes

| Mode | Trigger Phrases | Description |
|------|----------------|-------------|
| `quick` | "check", "verify", "is it running", "quick check" | Base health check: serial alive, shell responds, system OK |
| `full` | "full diag", "deep check", "comprehensive" | Deep diagnosis: tasks, heap, network, modem, peripherals |
| `at` | "at command", "csq", "creg", "send AT" | Send specific AT command and parse response |
| `shell` | "shell", "command", "run on device" | Send command to device shell and capture output |

### Mode: `quick` — Basic Health Check

1. **Serial alive**: Send newline over serial, check for prompt echo
2. **Shell responds**: Send `help` or `?` command, check for known command list
3. **System timestamp**: Look for uptime or tick count in response
4. **Basic state**: If device supports it, run `status` or `info` command
5. Report: PASS/FAIL for each check, overall health status

### Mode: `full` — Deep Diagnosis

Run a structured diagnostic across multiple layers. Adapt to what's available on the device:

**Layer 1: RTOS Health**
- Task list: `tasklist` or `ps` or FreeRTOS `vTaskList` output
- Stack high watermarks: check for near-overflow tasks
- Heap free: `heap` or `free` or `xPortGetFreeHeapSize`
- CPU usage if available

**Layer 2: Network Stack (if applicable)**
- Interface status: `netif`, `ifconfig`, `ip addr`
- DNS: `dns <hostname>` to test resolution
- Ping: `ping <ip>` to test connectivity
- PPP status: `ppp_status`, `ppp_info`

**Layer 3: Modem/Radio (if applicable)**
- Signal quality: `AT+CSQ`
- Network registration: `AT+CREG?`
- Operator: `AT+COPS?`
- Attach status: `AT+CGATT?`
- APN/PDP context: `AT+CGDCONT?`

**Layer 4: Peripherals**
- USB status (if USB host): device enumeration status
- Sensor readings (if applicable)
- Storage/filesystem (if applicable)

**Layer 5: Application**
- App-specific status commands
- Recent error counters
- Uptime, reset reason

Report each layer as PASS/FAIL/WARN with evidence.

### Mode: `at` — AT Command

1. **Send AT command**: Write `at <AT command>` to serial (via letter-shell `at` command), or send raw AT if the device is in AT command mode
2. **Wait for response**: Typical AT response ends with `OK` or `ERROR`
3. **Parse response**:

| AT Command | Parse | Example |
|-----------|-------|---------|
| `AT+CSQ` | RSSI, BER | RSSI=20 (good), BER=99 (unknown) |
| `AT+CREG?` | Registration status (0-5) | 0,1 = registered home network |
| `AT+COPS?` | Operator name/number | CHINA MOBILE |
| `AT+CGATT?` | GPRS attach status | 1 = attached |
| `AT+CGDCONT?` | PDP context (APN) | IP, "cmnet" |
| `AT+QENG?` | Engineering info (vendor-specific) | Cell ID, band, channel |
| `AT+CPIN?` | SIM status | READY |

4. Interpret: map raw values to human-readable status. Flag abnormal values (e.g., CSQ < 10 = poor signal).

### Mode: `shell` — Device Shell Command

1. **Send command**: Write to serial
2. **Wait for response**: Read from serial log (poll or tail)
3. **Capture output**: Return raw output and attempt to parse structured data

## Failure Triage

| Scenario | Category |
|----------|----------|
| No serial connection active | `connection-failure` |
| Shell not responding to commands | `target-response-abnormal` |
| AT command returns ERROR or timeout | `target-response-abnormal` |
| Device shell commands unknown (can't auto-detect) | `ambiguous-context` |
| Serial log unavailable or unreadable | `permission-problem` |

## Platform Notes

- Uses serial communication — same platform notes as `embed-serial`
- AT command parsing is modem-specific; some AT commands are vendor extensions (Quectel, SIMCom, u-blox, etc.)

## AT Command Knowledge Base

### Generic (3GPP standard)

| Command | Response fields | Normal range |
|---------|----------------|--------------|
| `AT` | `OK` | Basic connectivity test |
| `AT+CSQ` | `+CSQ: <rssi>,<ber>` | RSSI 0-31 (99=unknown), BER 0-7 (99=unknown) |
| `AT+CREG?` | `+CREG: <n>,<stat>` | stat: 0=not registered, 1=home, 2=searching, 5=roaming |
| `AT+COPS?` | `+COPS: <mode>,<format>,<oper>` | Operator name or numeric code |
| `AT+CGATT?` | `+CGATT: <state>` | 0=detached, 1=attached |
| `AT+CGDCONT?` | `+CGDCONT: <cid>,<PDP_type>,<APN>,...` | PDP context info |
| `AT+CGACT?` | `+CGACT: <cid>,<state>` | 0=inactive, 1=active |

### Quectel-specific

| Command | Purpose |
|---------|---------|
| `AT+QENG?` | Engineering information (cell ID, band, channel, RSRP, SINR) |
| `AT+QNWINFO` | Network info (mode, operator, band) |
| `AT+QNETDEVSTATUS?` | Network device status |
| `AT+QCFG?` | Extended configuration |

### Signal Quality Reference

| RSSI | dBm range | Quality |
|------|-----------|---------|
| 2-9 | -109 to -95 | Marginal |
| 10-14 | -93 to -83 | OK |
| 15-19 | -81 to -71 | Good |
| 20-30 | -69 to -53 | Excellent |
| 99 | unknown | No signal or not available |

## Output Contract

```yaml
status: success | partial_success | failure | blocked
summary: "Device health check: 5/6 PASS. PPP connected (IP 10.64.x.x). Signal good (CSQ=20). 1 WARN: DNS resolution slow (2.1s)."
project_profile:
  # Updates with discovered commands and device info
evidence:
  - "serial: PASS — shell responding"
  - "AT+CSQ: PASS — RSSI 20 (excellent)"
  - "AT+CREG?: PASS — registered home network"
  - "ppp_status: PASS — LCP UP, IPCP UP, IP 10.64.115.83"
  - "ping: WARN — 2.1s latency to 8.8.8.8"
  - "heap: PASS — 18.2KB free of 32KB"
next_action: embed-debug (if crash/fault found) or embed-workflow (to re-test after fixes)
```

## Handoff

- On all PASS: report healthy, no action needed
- On network issues: suggest AT commands to check modem state, APN config, signal
- On crash/fault: recommend `embed-debug crash` for detailed analysis
- On RTOS anomalies: suggest stack size tuning, priority adjustments
