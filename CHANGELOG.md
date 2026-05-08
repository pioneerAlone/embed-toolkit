# Changelog

## v0.1.0 (unreleased)

- **8 skills**: embed-build, embed-flash, embed-serial, embed-debug, embed-diag, embed-workflow, embed-setup, embed-test
- **Auto-detection engine** (`embed_detect.js`): zero-dependency detection of build system, MCU, RTOS, debug probes, serial ports, and firmware artifacts
- **`.embed.json` override chain**: per-project configuration with CLI override support and profile persistence
- **Dual installers**: Node.js (`install.js`) and Python (`install.py`)
- **Standardized contracts**: shared Project Profile schema, failure taxonomy (7 categories), platform abstraction layer, and skill handoff protocol
- **Cross-platform**: macOS, Linux, and Windows support
- **Skill template** (`templates/SKILL.template.md`) for creating new skills
- **Test suite**: 27 tests covering detection engine, profile merging, and installer
- **CI/CD**: GitHub Actions workflows for test matrix and npm publishing
