#!/usr/bin/env python3
"""GDB debug helper for embed-debug skill.

Modes:
  detect        — Check available debug tools (GDB, GDB servers, probes)
  start-server  — Start GDB server (openocd/JLinkGDBServer/st-util/pyocd), wait until ready
  stop-server   — Stop running GDB server by port or PID
  batch         — Execute GDB batch commands against a running server
  status        — Check if GDB server is running on a port

Not meant to be run standalone — invoked by Claude Code during /embed-debug.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


# ── Tool Detection ──────────────────────────────────────────────────────

GDB_CANDIDATES = [
    "arm-none-eabi-gdb",
    "arm-zephyr-eabi-gdb",
    "xtensa-esp32-elf-gdb",
    "riscv32-esp-elf-gdb",
    "riscv-none-embed-gdb",
    "riscv64-unknown-elf-gdb",
    "riscv64-zephyr-elf-gdb",
    "gdb-multiarch",
]

SERVER_TOOLS = ["openocd", "JLinkGDBServer", "JLinkGDBServerCLExe", "st-util", "pyocd"]

DEFAULT_GDB_PORTS = {
    "openocd": 3333,
    "jlink": 2331,
    "stlink": 4242,
    "pyocd": 3333,
}


def detect_tools() -> dict:
    """Scan for available debug tools."""
    result: dict[str, list[str]] = {"gdb": [], "server": [], "probes": []}

    for gdb in GDB_CANDIDATES:
        if shutil.which(gdb):
            result["gdb"].append(gdb)

    for srv in SERVER_TOOLS:
        path = shutil.which(srv)
        if path:
            result["server"].append({"name": srv, "path": path})

    # Detect USB probes via common tools
    if shutil.which("JLinkExe"):
        result["probes"].append("jlink")
    if shutil.which("st-util"):
        result["probes"].append("stlink")
    if shutil.which("openocd"):
        result["probes"].append("openocd")
    if shutil.which("pyocd"):
        result["probes"].append("pyocd")

    return result


# ── Port Helpers ─────────────────────────────────────────────────────────

def is_port_open(port: int, host: str = "localhost") -> bool:
    """Check if something is listening on the given port."""
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except (OSError, ConnectionRefusedError):
        return False


def wait_for_port(port: int, timeout: float = 10.0, host: str = "localhost") -> bool:
    """Wait for a port to become open. Returns True if opened, False on timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_port_open(port, host):
            return True
        time.sleep(0.3)
    return False


def find_gdb_port(probe_type: str, user_port: Optional[int] = None) -> int:
    """Resolve GDB port. User override > default for probe > 3333."""
    if user_port:
        return user_port
    if probe_type in ("jlink", "jlinkgdb"):
        return DEFAULT_GDB_PORTS["jlink"]
    if probe_type in ("stlink", "stutil", "st-link"):
        return DEFAULT_GDB_PORTS["stlink"]
    return DEFAULT_GDB_PORTS["openocd"]


# ── GDB Server Management ────────────────────────────────────────────────

_server_pid: Optional[int] = None


def find_server_process(port: int) -> Optional[int]:
    """Find PID of process listening on given port."""
    try:
        if sys.platform == "linux":
            out = subprocess.check_output(
                ["ss", "-tlnp"], text=True, stderr=subprocess.DEVNULL
            )
            for line in out.splitlines():
                if f":{port}" in line:
                    # Extract pid from "pid=12345"
                    import re
                    m = re.search(r"pid=(\d+)", line)
                    if m:
                        return int(m.group(1))
        elif sys.platform == "darwin":
            out = subprocess.check_output(
                ["lsof", "-ti", f"tcp:{port}"], text=True
            )
            if out.strip():
                return int(out.strip().split("\n")[0])
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return None


def start_server(
    probe_type: str,
    port: int,
    interface: Optional[str] = None,
    target: Optional[str] = None,
    device: Optional[str] = None,
    extra_args: Optional[str] = None,
) -> Optional[int]:
    """Start a GDB server. Returns PID or None on failure."""

    if is_port_open(port):
        print(f"GDB server already running on port {port}", file=sys.stderr)
        pid = find_server_process(port)
        return pid

    cmd: list[str] = []

    if probe_type in ("openocd",):
        if not shutil.which("openocd"):
            print("ERROR: openocd not found", file=sys.stderr)
            return None
        cmd = ["openocd"]
        if interface:
            cmd.extend(["-f", f"interface/{interface}.cfg"])
        if target:
            cmd.extend(["-f", f"target/{target}.cfg"])
        cmd.extend(["-c", f"gdb_port {port}"])
        if extra_args:
            cmd.append(extra_args)

    elif probe_type in ("jlink", "jlinkgdb"):
        exe = "JLinkGDBServerCLExe" if sys.platform != "win32" else "JLinkGDBServerCL.exe"
        if not shutil.which(exe):
            print(f"ERROR: {exe} not found", file=sys.stderr)
            return None
        cmd = [exe]
        if device:
            cmd.extend(["-device", device])
        cmd.extend(["-if", "SWD", "-speed", "4000", "-port", str(port)])
        if extra_args:
            cmd.append(extra_args)

    elif probe_type in ("stlink", "stutil", "st-util"):
        if not shutil.which("st-util"):
            print("ERROR: st-util not found", file=sys.stderr)
            return None
        cmd = ["st-util", "-p", str(port)]

    elif probe_type in ("pyocd",):
        if not shutil.which("pyocd"):
            print("ERROR: pyocd not found", file=sys.stderr)
            return None
        cmd = ["pyocd", "gdbserver", "-p", str(port)]
        if device:
            cmd.extend(["-t", device])

    else:
        print(f"ERROR: unknown probe type '{probe_type}'", file=sys.stderr)
        return None

    print(f"Starting GDB server: {' '.join(cmd)}", file=sys.stderr)
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as e:
        print(f"ERROR: failed to start: {e}", file=sys.stderr)
        return None

    print(f"Waiting for port {port}...", file=sys.stderr)
    if not wait_for_port(port, timeout=15.0):
        print(f"ERROR: server did not start (port {port} not open after 15s)", file=sys.stderr)
        proc.kill()
        return None

    print(f"GDB server ready on port {port} (PID {proc.pid})", file=sys.stderr)
    return proc.pid


def stop_server(port: int) -> bool:
    """Stop GDB server on given port."""
    pid = find_server_process(port)
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            time.sleep(0.5)
            if find_server_process(port):
                os.kill(pid, signal.SIGKILL)
            print(f"Stopped GDB server on port {port}", file=sys.stderr)
            return True
        except OSError:
            pass
    print(f"No server found on port {port}", file=sys.stderr)
    return False


# ── GDB Batch Execution ──────────────────────────────────────────────────

def run_gdb_batch(
    elf: str,
    port: int,
    commands: list[str],
    gdb_exe: str = "arm-none-eabi-gdb",
) -> dict:
    """Run GDB in batch mode, return parsed output."""
    gdb_script = "\n".join([
        "set confirm off",
        "set pagination off",
        f"target extended-remote :{port}",
        *commands,
        "quit",
    ])

    try:
        proc = subprocess.run(
            [gdb_exe, elf, "-batch", "-x", "/dev/stdin"],
            input=gdb_script,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "success": proc.returncode == 0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "script": gdb_script,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "stdout": "", "stderr": "GDB timed out", "script": gdb_script}
    except FileNotFoundError:
        return {"success": False, "stdout": "", "stderr": f"GDB not found: {gdb_exe}", "script": gdb_script}


# ── Main ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="GDB debug helper for embed-debug")
    sub = parser.add_subparsers(dest="mode")

    # detect
    sub.add_parser("detect", help="Detect available debug tools")

    # start-server
    p_start = sub.add_parser("start-server", help="Start GDB server")
    p_start.add_argument("--probe", required=True, choices=["openocd", "jlink", "stlink", "pyocd"])
    p_start.add_argument("--port", type=int, default=0)
    p_start.add_argument("--interface", help="OpenOCD interface config (e.g., stlink)")
    p_start.add_argument("--target", help="OpenOCD target config (e.g., stm32f4x)")
    p_start.add_argument("--device", help="J-Link/pyOCD device name (e.g., STM32F407VG)")
    p_start.add_argument("--extra", help="Extra arguments for server")

    # stop-server
    p_stop = sub.add_parser("stop-server", help="Stop GDB server by port")
    p_stop.add_argument("--port", type=int, required=True)

    # batch
    p_batch = sub.add_parser("batch", help="Execute GDB batch commands")
    p_batch.add_argument("--elf", required=True, help="ELF file path")
    p_batch.add_argument("--port", type=int, required=True, help="GDB server port")
    p_batch.add_argument("--gdb", default="arm-none-eabi-gdb", help="GDB executable")
    p_batch.add_argument("--commands", nargs="+", required=True, help="GDB commands to execute")

    # status
    p_status = sub.add_parser("status", help="Check GDB server status")
    p_status.add_argument("--port", type=int, required=True)

    args = parser.parse_args()

    if args.mode == "detect":
        tools = detect_tools()
        print("=== GDB ===")
        for gdb in tools["gdb"]:
            print(f"  {gdb}")
        print("=== GDB Servers ===")
        for srv in tools["server"]:
            print(f"  {srv['name']}: {srv['path']}")
        print("=== Probes ===")
        for probe in tools["probes"]:
            print(f"  {probe}")

    elif args.mode == "start-server":
        port = find_gdb_port(args.probe, args.port if args.port else None)
        pid = start_server(
            probe_type=args.probe,
            port=port,
            interface=args.interface,
            target=args.target,
            device=args.device,
            extra_args=args.extra,
        )
        if pid:
            print(f"SERVER_READY port={port} pid={pid}")

    elif args.mode == "stop-server":
        ok = stop_server(args.port)
        sys.exit(0 if ok else 1)

    elif args.mode == "batch":
        result = run_gdb_batch(
            elf=args.elf,
            port=args.port,
            commands=args.commands,
            gdb_exe=args.gdb,
        )
        if result["success"]:
            print(result["stdout"])
        else:
            print(result["stderr"], file=sys.stderr)
            sys.exit(1)

    elif args.mode == "status":
        if is_port_open(args.port):
            pid = find_server_process(args.port)
            print(f"GDB server running on port {args.port}" + (f" (PID {pid})" if pid else ""))
        else:
            print(f"No GDB server on port {args.port}")
            sys.exit(1)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
