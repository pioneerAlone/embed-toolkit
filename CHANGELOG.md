# Changelog

## v0.1.0 (unreleased)

- **11 skills**: embed-build, embed-flash, embed-serial, embed-debug, embed-diag, embed-workflow, embed-setup, embed-test, embed-memory, embed-crash, embed-static
- **Shell installer** (`install.sh`): pure bash, zero dependencies, supports curl-pipe-bash
- **OpenCode support**: auto-detect OpenCode config, deploy flat .md files to `command/` directory
- **Per-tool install**: `--tool claude|opencode|generic` flag for selective installation
- **embed-memory**: Flash/RAM usage from .map/ELF, symbol size ranking, build diff
- **embed-crash**: HardFault/BusFault/UsageFault decoding, stack trace reconstruction, `crash_analyzer.py` helper
- **embed-static**: cppcheck, clang-tidy, GCC analyzer, MISRA-C compliance checks
- **Auto-detection engine** (`embed_detect.js`): zero-dependency detection of build system, MCU, RTOS, debug probes, serial ports, and firmware artifacts
- **`.embed.json` override chain**: per-project configuration with CLI override support and profile persistence
- **Triple installers**: Node.js (`install.js`), Python (`install.py`), and Bash (`install.sh`)
- **Standardized contracts**: shared Project Profile schema, failure taxonomy (7 categories), platform abstraction layer, and skill handoff protocol
- **Cross-platform**: macOS, Linux, and Windows support
- **Skill template** (`templates/SKILL.template.md`) for creating new skills
- **Test suite**: 31 tests covering detection engine, profile merging, and installer
- **CI/CD**: GitHub Actions workflows for test matrix and npm publishing
