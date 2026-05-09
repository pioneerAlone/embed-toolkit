#!/usr/bin/env python3
"""Crash dump analysis helpers for embed-crash skill.

Modes:
  parse-regs <hex>    — Decode CFSR/HFSR fault register values into human-readable text
  parse-stack <hex>   — Extract call chain addresses from Cortex-M exception stack frame
  gdb-stub --dump <f> — Present crash dump to GDB as a pseudo remote target (stdin/stdout)
  detect-tools         — Find available toolchain tools on PATH

Not meant to be run standalone by users — invoked by Claude Code during /embed-crash.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import struct
import sys
from pathlib import Path
from typing import Optional


# ── Fault Register Decoding ────────────────────────────────────────────

# Cortex-M CFSR bit definitions
UFSR_BITS = {
    25: "DIVBYZERO — Divide by zero attempted",
    24: "UNALIGNED — Unaligned memory access",
    19: "NOCP — Attempt to access disabled coprocessor",
    18: "INVPC — Invalid PC load (LSB=0 in Thumb mode?)",
    17: "INVSTATE — Invalid EPSR state (ARM code in Thumb?)",
    16: "UNDEFINSTR — Undefined instruction executed",
}

BFSR_BITS = {
    15: "BFARVALID — BFAR holds valid fault address",
    12: "STKERR — Stacking error on exception entry",
    11: "UNSTKERR — Unstacking error on exception return",
    10: "IMPRECISERR — Imprecise bus fault",
    9: "PRECISERR — Precise bus fault (check BFAR)",
    8: "IBUSERR — Instruction bus error",
}

MMFSR_BITS = {
    7: "MMARVALID — MMFAR holds valid fault address",
    5: "MLSPERR — FPU lazy state preservation error",
    4: "MSTKERR — Stacking error on exception entry",
    3: "MUNSTKERR — Unstacking error on exception return",
    1: "DACCVIOL — Data access violation (check MMFAR)",
    0: "IACCVIOL — Instruction access violation (XN region)",
}

SFSR_BITS = {
    7: "SFARVALID — SFAR holds valid fault address",
    4: "LSPERR — Lazy state preservation error",
    1: "INVER — Invalid exception return (Non-secure→Secure)",
    0: "INVIS — Invalid entry from Non-secure state",
}

HFSR_BITS = {
    31: "DEBUGEVT — Debug event (halt request)",
    30: "FORCED — Escalated from another fault (check CFSR)",
    2: "VECTTBL — Vector table read fault",
}


def decode_cfsr(cfsr: int) -> list[str]:
    """Decode CFSR value into human-readable fault descriptions."""
    results = []

    # CFSR is a composite: UFSR[15:8] | BFSR[7:0] | MMFSR[7:0]
    ufsr = (cfsr >> 8) & 0xFF  # Actually UFSR is bits [15:8], but also bit 16
    bfsr = (cfsr >> 8) & 0xFF  # BFSR is [7:0] of the upper half
    mmfsr = cfsr & 0xFF
    sfsr_low = cfsr & 0xFF  # SFSR shares MMFSR's bits in ARMv8-M

    # Decode UFSR (bits 16, 17, 18, 19, 24, 25)
    ufsr_full = ((cfsr >> 16) & 0xFFFF) | (ufsr & 0xFF)
    for bit, desc in UFSR_BITS.items():
        actual_bit = bit - 16 if bit >= 16 else bit
        if (ufsr_full >> (bit - 16)) & 1:
            results.append(f"UFSR[{bit}] {desc}")

    # Decode BFSR (bits 8-15)
    for bit, desc in BFSR_BITS.items():
        if (cfsr >> bit) & 1:
            results.append(f"BFSR[{bit}] {desc}")

    # Decode MMFSR (bits 0-7)
    for bit, desc in MMFSR_BITS.items():
        if (mmfsr >> bit) & 1:
            results.append(f"MMFSR[{bit}] {desc}")

    if not results:
        results.append("CFSR: No active fault flags")

    return results


def decode_hfsr(hfsr: int) -> list[str]:
    """Decode HFSR value."""
    results = []
    for bit, desc in HFSR_BITS.items():
        if (hfsr >> bit) & 1:
            results.append(f"HFSR[{bit}] {desc}")
    if not results:
        results.append("HFSR: No active fault flags")
    return results


# ── Stack Frame Parsing ────────────────────────────────────────────────


def parse_exception_frame(stack_words: list[int]) -> dict:
    """Parse Cortex-M exception stack frame from SP.

    Cortex-M exception frame layout (8 words pushed by hardware):
      SP+0:  R0
      SP+4:  R1
      SP+8:  R2
      SP+12: R3
      SP+16: R12
      SP+20: LR (link register — EXC_RETURN or caller)
      SP+24: PC (return address — where to resume)
      SP+28: xPSR

    Returns dict with register names and their values.
    """
    if len(stack_words) < 8:
        return {"error": f"Need at least 8 stack words, got {len(stack_words)}"}

    return {
        "R0": f"0x{stack_words[0]:08X}",
        "R1": f"0x{stack_words[1]:08X}",
        "R2": f"0x{stack_words[2]:08X}",
        "R3": f"0x{stack_words[3]:08X}",
        "R12": f"0x{stack_words[4]:08X}",
        "LR": f"0x{stack_words[5]:08X}",
        "PC": f"0x{stack_words[6]:08X}",
        "xPSR": f"0x{stack_words[7]:08X}",
    }


# ── Auto-parse from pasted text ─────────────────────────────────────────

REGEX_PATTERNS = {
    "pc": re.compile(
        r"(?:PC|pc)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "lr": re.compile(
        r"(?:LR|lr)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "sp": re.compile(
        r"(?:SP|sp)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "cfsr": re.compile(
        r"(?:CFSR|cfsr)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "hfsr": re.compile(
        r"(?:HFSR|hfsr)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "mmfar": re.compile(
        r"(?:MMFAR|mmfar)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "bfar": re.compile(
        r"(?:BFAR|bfar)\s*[:=]\s*(0x[0-9a-fA-F]{5,8})", re.IGNORECASE
    ),
    "fault_type": re.compile(
        r"(HardFault|BusFault|MemManage|UsageFault|SecureFault|NMI)",
        re.IGNORECASE,
    ),
}

STACK_HEX_PATTERN = re.compile(
    r"(?:Stack|stack|SP\[|dump)[\s\S]*?([0-9a-fA-F]{8}(?:\s+[0-9a-fA-F]{8}){3,})", re.IGNORECASE
)

HEX_WORD = re.compile(r"\b([0-9a-fA-F]{8})\b")


def parse_crash_text(text: str) -> dict:
    """Extract register values and stack words from pasted crash output.

    Works with output from: CmBacktrace, FreeRTOS fault handler, Zephyr fault,
    ESP-IDF panic handler, GDB 'info all-registers', and any common HardFault dump.

    Returns dict with extracted fields. Fields not found are absent.
    """
    result: dict = {}

    for key, pattern in REGEX_PATTERNS.items():
        match = pattern.search(text)
        if match:
            result[key] = match.group(1)

    # Extract stack hex — find a block of 8+ hex words
    hex_words = HEX_WORD.findall(text)
    if len(hex_words) >= 8:
        result["stack_words"] = [int(w, 16) for w in hex_words[:64]]  # up to 64 words

    return result


# ── Toolchain Detection ─────────────────────────────────────────────────

KNOWN_PREFIXES = [
    "arm-none-eabi",
    "arm-zephyr-eabi",
    "riscv64-zephyr-elf",
    "xtensa-esp32-elf",
    "xtensa-esp32s2-elf",
    "xtensa-esp32s3-elf",
    "riscv32-esp-elf",
    "riscv-none-embed",
    "riscv64-unknown-elf",
]

REQUIRED_TOOLS = ["addr2line", "gdb", "objdump", "nm"]


def detect_tools() -> dict:
    """Scan PATH for embedded toolchain tools.

    Returns dict: {prefix: [available_tools], ...}
    """
    found: dict[str, list[str]] = {}
    for prefix in KNOWN_PREFIXES:
        available = []
        for tool in REQUIRED_TOOLS:
            if shutil.which(f"{prefix}-{tool}"):
                available.append(tool)
        if available:
            found[prefix] = available
    return found


# ── GDB Stub Mode ───────────────────────────────────────────────────────

def gdb_stub(dump_path: str) -> None:
    """Act as a GDB remote target, serving crash dump contents.

    This is a minimal GDB Remote Serial Protocol (RSP) stub.
    It reads register/memory requests from GDB via stdin and responds via stdout.

    Currently supports the 'g' (read all registers) and 'm' (read memory)
    packets well enough for GDB to produce a backtrace.

    Usage:
      arm-none-eabi-gdb firmware.elf \
        -ex "target remote | python3 crash_analyzer.py gdb-stub --dump crash.txt"
    """
    # Load dump file
    dump_text = Path(dump_path).read_text(encoding="utf-8", errors="ignore")
    crash_data = parse_crash_text(dump_text)

    # Build register list: 16 core + 1 CPSR (17 x 4 bytes = 68 bytes hex = 136 chars)
    regs = [0] * 17  # R0-R15, CPSR

    if "PC" in crash_data:
        regs[15] = int(crash_data["PC"], 16)
    if "LR" in crash_data:
        regs[14] = int(crash_data["LR"], 16)
    if "SP" in crash_data:
        regs[13] = int(crash_data["SP"], 16)

    if "stack_words" in crash_data and crash_data["stack_words"]:
        frame = parse_exception_frame(crash_data["stack_words"])
        regs[0] = int(frame.get("R0", "0x0"), 16)
        regs[1] = int(frame.get("R1", "0x0"), 16)
        regs[2] = int(frame.get("R2", "0x0"), 16)
        regs[3] = int(frame.get("R3", "0x0"), 16)
        regs[12] = int(frame.get("R12", "0x0"), 16)
        if "PC" not in crash_data:
            regs[15] = int(frame.get("PC", "0x0"), 16)
        if "LR" not in crash_data:
            regs[14] = int(frame.get("LR", "0x0"), 16)

    # Simple memory map: stack area from SP value
    stack_base = regs[13] - 256 if regs[13] else 0x20000000
    memory: dict[int, bytes] = {}
    if "stack_words" in crash_data and crash_data["stack_words"]:
        mem_bytes = b"".join(
            struct.pack("<I", w) for w in crash_data["stack_words"]
        )
        memory[stack_base] = mem_bytes

    def _reg_packet() -> str:
        """Build GDB 'g' reply packet: all registers as little-endian hex."""
        parts = []
        for r in regs:
            parts.append(struct.pack("<I", r).hex())
        return "".join(parts)

    def _mem_packet(addr: int, length: int) -> str:
        """Build GDB 'm' reply packet: memory as hex."""
        data = bytearray(length)
        for base, mem in sorted(memory.items(), reverse=True):
            if base <= addr < base + len(mem):
                src_offset = addr - base
                copy_len = min(length, len(mem) - src_offset)
                data[:copy_len] = mem[src_offset : src_offset + copy_len]
                break
        return data.hex()

    def _handle_packet(pkt: str) -> str:
        """Process a single GDB RSP packet."""
        if pkt == "?":
            # Halt reason: SIGTRAP
            return "S05"
        if pkt == "g":
            return _reg_packet()
        if pkt.startswith("m"):
            # m<addr>,<length>
            parts = pkt[1:].split(",")
            addr = int(parts[0], 16)
            length = int(parts[1], 16)
            return _mem_packet(addr, length)
        if pkt == "qSupported":
            return "PacketSize=1024;qXfer:memory-map:read+"
        if pkt == "qAttached":
            return "1"
        if pkt == "qC":
            return "QC0"
        if pkt.startswith("qSymbol"):
            return "OK"
        if pkt == "Hg0" or pkt == "Hc0":
            return "OK"
        if pkt == "k":
            return ""  # kill — GDB will disconnect
        # Default: empty (unsupported)
        return ""

    def _checksum(data: str) -> str:
        csum = sum(ord(c) for c in data) & 0xFF
        return f"${data}#{csum:02X}"

    # Minimal RSP main loop — read packets from stdin, reply via stdout
    import signal

    signal.signal(signal.SIGINT, signal.SIG_IGN)

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if line.startswith("$"):
                pkt = line[1:].split("#")[0]
                reply = _handle_packet(pkt)
                if reply == "":
                    sys.stdout.write("$#00")
                else:
                    sys.stdout.write(_checksum(reply))
                sys.stdout.write("\n")
                sys.stdout.flush()
        except (EOFError, BrokenPipeError):
            break


# ── Main ────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: crash_analyzer.py <mode> [args...]", file=sys.stderr)
        print("Modes: parse-regs, parse-stack, parse-text, detect-tools, gdb-stub", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "parse-regs":
        if len(sys.argv) < 3:
            print("Usage: crash_analyzer.py parse-regs <CFSR_VALUE> [HFSR_VALUE]", file=sys.stderr)
            sys.exit(1)
        cfsr = int(sys.argv[2], 16)
        print("=== CFSR ===")
        for line in decode_cfsr(cfsr):
            print(f"  {line}")
        if len(sys.argv) >= 4:
            hfsr = int(sys.argv[3], 16)
            print("=== HFSR ===")
            for line in decode_hfsr(hfsr):
                print(f"  {line}")

    elif mode == "parse-stack":
        if len(sys.argv) < 3:
            print("Usage: crash_analyzer.py parse-stack <WORD1> <WORD2> ...", file=sys.stderr)
            sys.exit(1)
        words = [int(w, 16) for w in sys.argv[2:]]
        frame = parse_exception_frame(words)
        print("=== Exception Stack Frame ===")
        for reg, val in frame.items():
            print(f"  {reg}: {val}")

    elif mode == "parse-text":
        # Read crash text from stdin
        text = sys.stdin.read()
        result = parse_crash_text(text)
        print(json.dumps(result, indent=2, default=str))

    elif mode == "detect-tools":
        tools = detect_tools()
        if not tools:
            print("No embedded toolchains found on PATH")
        else:
            print("Detected toolchains:")
            for prefix, available in sorted(tools.items()):
                print(f"  {prefix} → {', '.join(available)}")

    elif mode == "gdb-stub":
        import argparse

        parser = argparse.ArgumentParser()
        parser.add_argument("--dump", required=True, help="Crash dump file path")
        args = parser.parse_args(sys.argv[2:])
        gdb_stub(args.dump)

    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
