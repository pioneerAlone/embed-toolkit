# Platform Compatibility

embed-toolkit targets Linux, macOS, and Windows hosts. Platform-specific behavior is centralized here to keep individual skills lean.

## OS Detection

- Normalize to: `linux`, `macos`, or `windows`
- Always write the detected OS into the Project Profile before making any platform-dependent decision
- Prefer checking tool existence directly rather than inferring from the OS

## Path & Command Line Rules

- Prefer absolute paths in output
- Quote paths containing spaces properly
- On Windows, expect executables may have `.exe` suffix and paths may use backslashes, even if the tool accepts forward slashes
- Prefer native tool command lines over shell wrappers, so the same skill describes the same flow across platforms

## Serial Port Naming

- **Linux**: `/dev/ttyACM*`, `/dev/ttyUSB*`, or vendor-specific `/dev/serial/*` symlinks
- **macOS**: prefer `/dev/cu.*` for active connections; `/dev/tty.*` as secondary candidates
- **Windows**: identify as `COM` ports; preserve full `COMx` name in output

## Permissions

- **Linux**: often requires correct user group membership or udev rules for USB probes and serial ports
- **macOS**: probe access issues often manifest as "device not found" rather than explicit permission errors
- **Windows**: driver missing or COM port in use are more common than Unix-style permission denials

## Tool Priority

- Detect `cmake`, `ninja`, `openocd`, and `arm-none-eabi-gdb` by checking for executables directly
- For serial monitoring, prefer `python3 -m serial.tools.miniterm` (cross-platform with `pyserial`)
- Use OS-specific fallbacks only when the preferred cross-platform tool is unavailable AND an OS-native alternative is installed

## Temporary Files & Logs

- Serial logs: `/tmp/embed_serial_<port>.log` on Linux/macOS; `%TEMP%\embed_serial_<port>.log` on Windows
- Build outputs: honored as-is from the build system; tool does not relocate artifacts
