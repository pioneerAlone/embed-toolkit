# Cortex-M Fault Register Reference

Quick-reference for decoding fault status registers across Cortex-M variants.

## Register Availability by Core

| Register | M0/M0+ | M3/M4/M7 | M23 | M33 (ARMv8-M) |
|----------|--------|----------|-----|---------------|
| HFSR | ✓ | ✓ | ✓ | ✓ |
| CFSR (combined) | ✗ | ✓ | ✓ | ✓ |
| UFSR (subset) | ✗ | ✓ | ✓ | ✓ |
| BFSR (subset) | ✗ | ✓ | ✗ | ✓ |
| MMFSR (subset) | ✗ | ✓ | ✗ | ✓ |
| SFSR (subset) | ✗ | ✗ | ✓ | ✓ |
| MMFAR | ✗ | ✓ | ✗ | ✓ |
| BFAR | ✗ | ✓ | ✗ | ✓ |

## CFSR — Configurable Fault Status Register

Base: `SCB->CFSR` (0xE000ED28)

### UFSR — UsageFault Status Register [15:8]

| Bit | Name | Description |
|-----|------|-------------|
| 9 | DIVBYZERO | Divide by zero attempted |
| 8 | UNALIGNED | Unaligned memory access |
| 3 | NOCP | Attempt to access a disabled coprocessor |
| 2 | INVPC | Invalid PC load (e.g., branch to address with LSB=0 in Thumb mode) |
| 1 | INVSTATE | Attempt to execute with invalid EPSR state |
| 0 | UNDEFINSTR | Undefined instruction executed |

### BFSR — BusFault Status Register [7:0] (M3/M4/M7/M33)

| Bit | Name | Description |
|-----|------|-------------|
| 7 | BFARVALID | BFAR contains a valid fault address |
| 4 | STKERR | Stacking error (exception entry) |
| 3 | UNSTKERR | Unstacking error (exception return) |
| 2 | IMPRECISERR | Imprecise bus fault (address not captured) |
| 1 | PRECISERR | Precise bus fault (address captured in BFAR) |
| 0 | IBUSERR | Instruction bus error |

### MMFSR — MemManage Status Register (M3/M4/M7/M33)

| Bit | Name | Description |
|-----|------|-------------|
| 7 | MMARVALID | MMFAR contains a valid fault address |
| 5 | MLSPERR | Floating-point lazy state preservation error (M4/M7 with FPU) |
| 4 | MSTKERR | Stacking error on exception entry |
| 3 | MUNSTKERR | Unstacking error on exception return |
| 1 | DACCVIOL | Data access violation (MMFAR holds address) |
| 0 | IACCVIOL | Instruction access violation (execute from XN region) |

### SFSR — SecureFault Status Register (M23/M33 ARMv8-M)

| Bit | Name | Description |
|-----|------|-------------|
| 7 | SFARVALID | SFAR contains a valid fault address |
| 4 | LSPERR | Lazy state preservation error |
| 1 | INVER | Invalid exception return from Non-secure to Secure |
| 0 | INVIS | Invalid entry from Non-secure to Secure state |

## HFSR — HardFault Status Register

Base: `SCB->HFSR` (0xE000ED2C) — present on ALL Cortex-M variants.

| Bit | Name | Description |
|-----|------|-------------|
| 31 | DEBUGEVT | Debug event (halt request) |
| 30 | FORCED | HardFault is escalated from another fault (check CFSR for root cause) |
| 2 | VECTTBL | Vector table read fault (bad vector address) |
| 1 | UNUSED1 | Reserved |

**Key interpretation rule**: If HFSR.FORCED (bit 30) = 1, look at CFSR for the original fault. This HardFault is just the escalation — the root cause is in CFSR.

## Common Fault Patterns

| CFSR Bits | HFSR Bits | Probable Cause |
|-----------|-----------|----------------|
| UFSR.DIVBYZERO | FORCED=1 | Division by zero |
| UFSR.UNALIGNED | FORCED=1 | Unaligned memory access (also need UNALIGN_TRP=1 in CCR) |
| UFSR.INVSTATE | FORCED=1 | Tried to execute ARM code in Thumb state, or bad function pointer |
| UFSR.UNDEFINSTR | FORCED=1 | Undefined instruction — corrupted code or wrong architecture |
| BFSR.PRECISERR | FORCED=1 | Bus fault at known address (check BFAR) — peripheral not clocked, bad address |
| BFSR.STKERR | FORCED=1 | Stack overflow — couldn't push exception frame |
| MMFSR.DACCVIOL | FORCED=1 | Access to protected/MPU-forbidden memory (check MMFAR) |
| MMFSR.IACCVIOL | FORCED=1 | Execute from eXecute-Never region |
| HFSR.VECTTBL | — | Vector table at invalid address. Boot issue or VTOR misconfigured. |
