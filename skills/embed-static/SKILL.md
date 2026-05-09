---
name: embed-static
description: Run static analysis on embedded C/C++ code — cppcheck, clang-tidy, GCC analyzer, and MISRA-C compliance checks.
---

# embed-static — Static Analysis

## When to Use

- User asks for "static analysis", "lint", "code quality check", "cppcheck", "clang-tidy", "MISRA"
- Before committing code, to catch potential bugs early
- Setting up CI/CD quality gates for an embedded project
- Checking MISRA-C compliance (automotive, medical, industrial safety-critical)
- Investigating a crash — static analysis may find the root cause (null deref, buffer overflow, etc.)

## Required Inputs

- Source directory path (auto-detected from workspace root)
- At least one static analysis tool installed (cppcheck recommended as baseline)
- Optional: `compile_commands.json` path (improves clang-tidy accuracy)
- Optional: MISRA addon for cppcheck (`--addon=misra`)

## Auto-Detection

1. Check `.embed.json` for `static_analysis` overrides (tool preferences, rule sets)
2. Detect available tools: `cppcheck`, `clang-tidy`, GCC (version check for `-fanalyzer`)
3. Search workspace for `compile_commands.json` (CMake builds generate this)
4. Priority: user-specified tool > `.embed.json` > auto-detect all available

## Steps

### 1. Detect Available Tools

Check what's installed:

```bash
cppcheck --version          # v2.10+ recommended
clang-tidy --version        # v16+ recommended
gcc --version               # v12+ for -fanalyzer support
```

If nothing is found, report `environment-missing` and suggest install commands per platform:

| Tool | macOS | Ubuntu/Debian | Windows |
|------|-------|---------------|---------|
| cppcheck | `brew install cppcheck` | `apt install cppcheck` | `choco install cppcheck` or [cppcheck.net](https://cppcheck.net) |
| clang-tidy | Included with LLVM (`brew install llvm`) | `apt install clang-tidy` | Included with LLVM installer |
| GCC 12+ | `brew install gcc` | `apt install gcc-12` | via MSYS2 or WSL |

### 2. Run cppcheck (Baseline — always run if available)

```bash
# Full check, ARM embedded platform config
cppcheck \
  --enable=all \
  --platform=arm32 \
  --inline-suppr \
  --suppress=missingIncludeSystem \
  --suppress=unmatchedSuppression \
  --xml \
  --xml-version=2 \
  <source_dir> 2> cppcheck.xml

# Or for human-readable output:
cppcheck \
  --enable=all \
  --platform=arm32 \
  --inline-suppr \
  --suppress=missingIncludeSystem \
  --template='{file}:{line}: {severity}: {message} [{id}]' \
  <source_dir>
```

`--enable=all` covers: error, warning, performance, portability, style, information, unusedFunction, missingInclude.

**Key flags:**
- `--platform=arm32` — sets `sizeof(int)=4`, `sizeof(long)=4`, `sizeof(pointer)=4` (typical ARM Cortex-M)
- `--inline-suppr` — honor inline suppression comments (`// cppcheck-suppress ...`)
- `--suppress=missingIncludeSystem` — skip system headers (not available for cross-compiled embedded targets)

### 3. Run clang-tidy (if compile_commands.json exists)

```bash
clang-tidy \
  -p <build_dir_with_compile_commands.json> \
  -checks='cert-*,bugprone-*,performance-*,readability-*,misc-*,portability-*' \
  --header-filter='.*' \
  <source_files>
```

If `compile_commands.json` doesn't exist, generate it:
- CMake: add `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`
- Or run `bear -- make` (compile wrapper)
- PlatformIO: `pio run -t compiledb`

Without `compile_commands.json`, clang-tidy has limited value for embedded projects (can't resolve include paths). Skip if not available — don't ask user to generate it; just note it as a recommendation.

### 4. Run GCC Analyzer (if GCC 12+)

```bash
# Add to CFLAGS in Makefile or CMake
-fanalyzer -Wanalyzer-allocation-size -Wanalyzer-deref-before-check
```

GCC `-fanalyzer` runs during compilation, not as a separate pass. If the project already builds with GCC 12+, suggest enabling it. Don't attempt to run a separate compilation for analysis only (too invasive).

### 5. MISRA-C Check (if requested)

Requires cppcheck with MISRA addon. The addon is distributed with cppcheck:

```bash
# Check MISRA addon path
ls $(dirname $(which cppcheck))/../share/cppcheck/addons/misra.py

# Run with MISRA
cppcheck \
  --enable=all \
  --platform=arm32 \
  --addon=misra \
  --inline-suppr \
  --suppress=missingIncludeSystem \
  <source_dir>
```

MISRA-C check results map to:
- **Mandatory**: always flag, never waive
- **Required**: flag, formal deviation process
- **Advisory**: best practice, team discretion

### 6. Parse and Group Results

Aggregate findings by severity:

| Level | cppcheck | clang-tidy | Action |
|-------|----------|------------|--------|
| **Critical** | `error` | `bugprone-*`, `cert-*` findings | Must fix, block CI |
| **Warning** | `warning` | `misc-*` | Should fix |
| **Info** | `performance`, `style`, `portability` | `performance-*`, `readability-*` | Consider fixing |
| **MISRA** | via MISRA addon | — | Per rule category |

Present results as:
- **Summary**: N errors, M warnings, P style issues, Q MISRA violations
- **Top findings**: grouped by severity, sorted by file
- **Quality gate**: pass/fail against configurable thresholds (default: zero critical, <5 warnings)

### 7. Diff Scanning (if requested)

For existing codebases that want to start using static analysis incrementally:

```bash
# Get changed files
git diff --name-only HEAD~1 -- '*.c' '*.h' '*.cpp' '*.hpp'

# Run cppcheck only on changed files
cppcheck --enable=all --platform=arm32 $(git diff --name-only HEAD~1 -- '*.c' '*.h')
```

This avoids overwhelming the user with thousands of warnings in legacy code.

## Failure Triage

| Scenario | Category |
|----------|----------|
| No static analysis tools found (cppcheck, clang-tidy both missing) | `environment-missing` |
| `compile_commands.json` missing for clang-tidy | `project-config-error` |
| MISRA addon not found with cppcheck | `environment-missing` |
| Source directory has no C/C++ files | `ambiguous-context` |
| Analysis produces empty results (tool failed silently) | `ambiguous-context` |

## Platform Notes

- cppcheck runs on any host OS — no cross-compilation needed
- clang-tidy needs `compile_commands.json` for accurate include paths
- GCC `-fanalyzer` requires GCC 12+ (check with `gcc -dumpversion`)
- MISRA addon ships with cppcheck 2.0+

## Output Contract

```yaml
status: success | partial_success | blocked | failure
summary: "Static analysis: 0 critical, 3 warnings, 12 style issues. 98.2% MISRA compliance. Quality gate: PASS."
evidence:
  - "cppcheck --enable=all --platform=arm32 src/"
  - "3 warnings: 2x 'unused variable' in main.c, 1x 'possible null deref' in uart.c"
  - "MISRA: 98.2% (1 mandatory violation: Rule 17.2 in isr.c)"
next_action: "Review warnings — possible null deref in uart.c:142 should be investigated"
failure_category: null
project_profile:
  static_analysis_run: "2026-05-09T12:00:00Z"
  static_analysis_result: "pass"
```

## Handoff

- On pass: no downstream action required
- On critical findings: suggest fixing before `embed-build`
- On MISRA violations: suggest reviewing deviation policy if violations are intentional
