# Failure Taxonomy

Standard failure categories used consistently across all skills.

## `environment-missing`

Use when a required host tool or runtime is unavailable.

- **Examples**: missing `cmake`, `openocd`, `arm-none-eabi-gdb`, `pyserial`
- **Response**: state the missing dependency, how it was detected, and the minimum install or path fix needed to proceed

## `project-config-error`

Use when the repository layout or configuration itself blocks a valid workflow.

- **Examples**: corrupted CMake preset, missing toolchain file, invalid OpenOCD config, conflicting artifact naming
- **Response**: point to the offending config file or missing setting; do not guess

## `connection-failure`

Use when the host cannot connect to the board or probe.

- **Examples**: probe not connected, USB claim failed, OpenOCD cannot find adapter, serial port disappeared mid-session
- **Response**: list the probes or ports attempted and the most likely physical connection or permission cause

## `artifact-missing`

Use when a requested or required firmware artifact does not exist or cannot be safely parsed.

- **Examples**: no ELF after build, multiple HEX candidates found, BIN present but no base address known
- **Response**: state the search scope and give candidates or the missing path

## `target-response-abnormal`

Use when the target device is reachable but behaves unexpectedly.

- **Examples**: verification mismatch after flash, core won't halt, repeated reset loops, GDB attached but symbols don't match
- **Response**: state the specific stage where the anomaly occurred and recommend the next diagnostic action

## `permission-problem`

Use when host permissions prevent access to a device or file.

- **Examples**: serial device not writable on Linux, USB access denied, build directory not writable
- **Response**: identify the denied resource and the minimum permission adjustment needed

## `ambiguous-context`

Use when multiple equally reasonable target candidates remain, and choosing arbitrarily risks wasting time or breaking the flow.

- **Examples**: multiple boards connected, multiple OpenOCD configs available, multiple serial ports, multiple equally valid build presets
- **Response**: list the candidates and state which single piece of information would resolve the ambiguity
