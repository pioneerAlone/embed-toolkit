---
name: embed-serial
description: Serial port monitor and logger for embedded devices — list ports, start/stop background logging, view captured logs, filter by keywords, and tail live output.
---

# embed-serial — Serial Monitor & Logger

## When to Use

- User says "serial", "uart", "serial monitor", "com port", "see serial output"
- After flashing firmware to observe device boot
- To capture device logs for debugging
- To filter logs for specific patterns (errors, warnings, specific modules)
- Part of `/embed-workflow` orchestration

## Required Inputs

- A serial port (or enough info from Project Profile to detect one)
- Optional: `baud_rate`, `serial_port` from `.embed.json`
- Optional: filter keywords, log file path, duration

## Auto-Detection

1. Check `.embed.json` for `serial_port` and `baud_rate` overrides
2. Check Project Profile for previously used `serial_port`
3. Scan host for available serial ports (using `embed_detect.js` or direct device listing)
4. Priority: user input > `.embed.json` > Project Profile > auto-detection > block and ask

## Steps

### Modes

This skill supports 6 modes. Determine which mode the user wants:

| Mode | Trigger Phrases | Description |
|------|----------------|-------------|
| `list` | "list", "scan", "show ports", "which serial" | List available serial ports |
| `start` | "start", "monitor", "capture", "log", "record" | Start background logging |
| `stop` | "stop", "kill", "end" | Stop background logging |
| `view` | "view", "show", "cat", "read", "see" | View captured logs |
| `filter` | "filter", "grep", "search", "find errors" | View logs with keyword filtering |
| `tail` | "tail", "follow", "live", "stream" | Follow live log output |

### Mode: `list`

1. Scan for serial ports on the host OS:
   - **macOS**: `ls /dev/cu.*` — filter out Bluetooth, WISHEE, iFly, Wireless devices
   - **Linux**: `ls /dev/ttyACM* /dev/ttyUSB*`
   - **Windows**: `python3 -m serial.tools.list_ports` or `mode`
2. For each port found, try to read device description if available
3. Highlight ports that look like MCU debuggers (ST-Link, J-Link, CMSIS-DAP virtual COM ports)
4. Return the list. If only one plausible port, suggest it as default.

### Mode: `start`

1. **Resolve port**: Use user-specified port, `.embed.json` setting, Project Profile, or auto-detect. If multiple ports, list candidates and block.
2. **Resolve baud rate**: Use user-specified, `.embed.json`, Project Profile, or default to `115200`.
3. **Check occupancy**: Run `lsof <port>` (macOS/Linux) to check if another process holds the port. If occupied:
   - Ask user if they want to kill the existing process
   - Or suggest using the existing monitor
4. **Start logger**: Launch a background process that reads the serial port and writes to a log file.
   - Use `python3 -m serial.tools.miniterm <port> <baud>` if `pyserial` is installed
   - Or a simple `cat <port> > /tmp/embed_serial_<port_name>.log` if no pyserial
   - If the project has a custom logger script (e.g., `scripts/uart_logger.py`), prefer that
5. **Record metadata**: Note PID, log file path, port, baud rate
6. **Optional — avoid missing early boot**: Add a 2-second wait, then suggest resetting the device (`embed-flash` if needed)
7. Update Project Profile with `serial_port` and `baud_rate`

Log file naming: `/tmp/embed_serial_<port_basename>.log`

### Mode: `stop`

1. Find the background logger process (by port name or stored PID)
2. Send SIGTERM (or `kill`)
3. Confirm process stopped
4. Report log file location and total bytes captured

### Mode: `view`

1. Read the log file (`/tmp/embed_serial_*.log`) from disk
2. If log is large (>500 lines), show last 200 lines by default
3. Offer to show more if needed

### Mode: `filter`

1. Read the log file
2. Apply keyword filters. Preset keywords:
   - `ERROR`, `FAIL`, `PANIC`, `ASSERT`, `FAULT`, `HARDFAULT`
   - `TIMEOUT`, `BUSY`, `NAK`
   - `???` (common error indicator in embedded logs)
3. User can specify custom keywords (e.g., "AT", "PPP", "NET", "USB")
4. Show matching lines with context (2 lines before and after)
5. Summarize: count of each error type, any patterns

### Mode: `tail`

1. Run `tail -f <log_file>` to follow live output
2. Let user interrupt with Ctrl+C
3. After tail ends, offer to analyze what was seen

## Failure Triage

| Scenario | Category |
|----------|----------|
| `pyserial` not installed and no `cat` fallback works | `environment-missing` |
| Serial port does not exist or disappeared mid-session | `connection-failure` |
| Serial port exists but cannot be opened (permission) | `permission-problem` |
| Multiple serial ports, no way to choose | `ambiguous-context` |
| Logger process died unexpectedly | `connection-failure` |
| Device output is garbled (wrong baud rate) | `target-response-abnormal` |
| Port busy (another process using it) | `permission-problem` |

## Platform Notes

- **macOS**: Prefer `/dev/cu.*` over `/dev/tty.*`. Filter out Bluetooth-Incoming-Port, WISHEE, iFly devices. Use `lsof` to check port occupancy.
- **Linux**: Check `/dev/ttyACM*` and `/dev/ttyUSB*`. May need `dialout` group membership. Use `fuser` or `lsof` to check occupancy.
- **Windows**: Use `python3 -m serial.tools.list_ports` for detection. COM port naming uses `COMx` format.

## Output Contract

```yaml
status: success | blocked | failure
summary: "Serial monitor started on /dev/cu.usbserial-1110 @115200, logging to /tmp/embed_serial_cu.usbserial-1110.log"
project_profile:
  serial_port: /dev/cu.usbserial-1110
  baud_rate: 115200
  serial_log: /tmp/embed_serial_cu.usbserial-1110.log
  serial_pid: 12345
evidence:
  - "Port: /dev/cu.usbserial-1110"
  - "Baud: 115200"
  - "Process: uart_logger.py (PID 12345)"
  - "Log: /tmp/embed_serial_cu.usbserial-1110.log"
next_action: embed-flash (if flashing next) or embed-diag (to analyze logs)
```

## Handoff

- After `start`: recommend `embed-flash` to program and capture boot logs
- After `view`/`filter` with errors: recommend `embed-diag` for structured diagnosis
- After `view`/`filter` with crashes: recommend `embed-debug crash`
