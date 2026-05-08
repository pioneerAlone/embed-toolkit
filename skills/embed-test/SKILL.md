---
name: embed-test
description: Run tests on embedded target — detect test framework (Unity, CppUTest, Ceedling, Google Test), run on-host or on-target, and parse results.
---

# embed-test — Embedded Test Runner

## When to Use

- User says "test", "run tests", "unit test", "integration test", "verify on hardware"
- After code changes and before flashing to verify correctness
- CI pipeline needs to validate firmware build
- Part of a development workflow: code → test → build → flash

## Required Inputs

- A Project Profile with at least `workspace_root`
- Optional: test framework hint, test command override from `.embed.json`
- Optional: target device connection for on-target tests

## Auto-Detection

1. Check `.embed.json` for `test_cmd` or `test_framework` overrides
2. Scan workspace for test framework markers
3. Priority: user input > `.embed.json` > auto-detection > ask user

## Steps

### Mode Detection

| Mode | Trigger Phrases | Description |
|------|----------------|-------------|
| `host` (default) | "test", "unit test", "run tests" | Run tests on the host machine |
| `target` | "on target", "on hardware", "hardware test", "integration test" | Build test firmware, flash, collect results via serial |
| `list` | "what tests", "list tests", "test suites" | List available test suites without running |

### Framework Detection

Scan workspace for:

| Framework | Markers | Host Test Command |
|-----------|---------|-------------------|
| **Ceedling** | `project.yml` with `:test_runner` | `ceedling test:all` |
| **Unity** | `unity.h` include + test directory with `test_*.c` | Custom: compile and run test runner |
| **CppUTest** | `CppUTest/` directory or `CppUTestExt/MockSupport.h` include | `make -C test && ./test/test_runner` |
| **Google Test** | `gtest/gtest.h` include or CMake `find_package(GTest)` | `ctest --test-dir build` |
| **CTest** | `CMakeLists.txt` with `enable_testing()` | `ctest --test-dir build` |
| **Custom script** | `.embed.json` `test_cmd`, `scripts/test.sh` | Execute the custom command |

### Mode: `host` — Run Tests on Host Machine

1. **Detect framework** and determine the test command
2. **Build tests** if needed (for CppUTest, Google Test, Ceedling — the test command usually handles this)
3. **Execute tests** and capture stdout
4. **Parse results:**
   - PASS count, FAIL count, IGNORE/SKIP count
   - For each failure: test name, file:line, assertion that failed
   - Overall status: ALL PASS / SOME FAIL / BUILD FAILED
5. **Update Project Profile** with `test_framework` and `test_command`

### Mode: `target` — Run Tests on Target Hardware

1. **Ensure firmware is built** — invoke `embed-build` if needed (with test configuration)
2. **Start serial monitor** — invoke `embed-serial start` to capture output
3. **Flash test firmware** — invoke `embed-flash`
4. **Wait for test output** on serial (timeout: 30s)
5. **Parse serial output** for test result patterns:
   - Unity: `OK (X tests)` or `FAIL (X tests, Y failed)`
   - CppUTest: `OK (X tests, Y ran, ...)` or `Errors (X failures)`
   - Custom: look for `PASS`/`FAIL` line patterns
6. **Stop serial monitor** — invoke `embed-serial stop`
7. **Report results**

### Mode: `list` — List Available Tests

1. Detect test framework
2. For Ceedling: parse `project.yml` for test files
3. For CTest: run `ctest -N --test-dir build`
4. For custom: scan `test/` directory for `test_*.c` files
5. Return test suite names and file paths

## Failure Triage

| Scenario | Category |
|----------|----------|
| Test framework not detected and no custom command | `ambiguous-context` |
| Test compilation fails | `project-config-error` |
| On-target test times out (no output) | `connection-failure` |
| Test binary crashes or hangs | `target-response-abnormal` |
| Serial port not available for on-target test | `connection-failure` |

## Platform Notes

- On-target testing requires a working flash pipeline (embed-flash) and serial connection (embed-serial)
- Some tests require specific hardware peripherals — note which tests were skipped
- Ceedling uses Ruby; verify `ruby` and `ceedling` gem are installed before running
- Google Test may require `libgtest-dev` on Linux

## Output Contract

```yaml
status: success | partial_success | failure | blocked
summary: "Tests: 12/12 PASS. Framework: Ceedling. Time: 2.3s."
project_profile:
  test_framework: ceedling
  test_command: ceedling test:all
evidence:
  - "Framework: Ceedling (detected from project.yml)"
  - "Command: ceedling test:all"
  - "Results: 12 passed, 0 failed, 0 ignored"
  - "Duration: 2.3s"
next_action: embed-build (if tests pass) or null (fix failures first)
```

## Handoff

- All tests pass: recommend `embed-build` → `embed-flash`
- Test failures: report failing tests with file locations, recommend fixing and re-running
- Build failure: report the compile error, recommend checking test configuration
