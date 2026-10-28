#!/usr/bin/env python3
"""Run Backtrack's documented API and frontend as one restartable local stack."""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(__file__).resolve()
STATE_DIR = ROOT / "data" / ".runtime"
STATE_FILE = STATE_DIR / "run.json"
FRONTEND_PORT = 4003
BACKEND_PORT = 8001
STOP_TIMEOUT_SECONDS = 30
children: list[subprocess.Popen[bytes]] = []
stop_requested = False


def alive(pid: int) -> bool:
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "stat="],
        check=False,
        capture_output=True,
        text=True,
    )
    state = result.stdout.strip()
    if result.returncode == 0 and state:
        return not state.startswith("Z")
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def command_line(pid: int) -> str:
    result = subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def stop_existing() -> None:
    if not STATE_FILE.exists():
        return
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            raise RuntimeError(f"Cannot verify Backtrack's saved runner state at {STATE_FILE}.")
        pid = int(state["pid"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Cannot verify Backtrack's saved runner state at {STATE_FILE}.") from error
    if state.get("root") != str(ROOT):
        raise RuntimeError("The saved runner state belongs to a different project; no process was stopped.")
    if not alive(pid):
        STATE_FILE.unlink()
        return
    if str(SCRIPT) not in command_line(pid):
        raise RuntimeError("The saved PID is not Backtrack's runner; no process was stopped.")

    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + STOP_TIMEOUT_SECONDS
    while alive(pid) and time.monotonic() < deadline:
        time.sleep(0.2)
    if alive(pid):
        raise RuntimeError("Backtrack's runner did not stop gracefully; no other process was touched.")
    if STATE_FILE.exists():
        STATE_FILE.unlink()


def require_free_port(port: int) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        try:
            listener.bind(("127.0.0.1", port))
        except OSError as error:
            raise RuntimeError(f"Port {port} is already in use; no listener was stopped.") from error


def group_alive(process: subprocess.Popen[bytes]) -> bool:
    result = subprocess.run(
        ["ps", "-axo", "pgid=,stat="],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        for line in result.stdout.splitlines():
            fields = line.split()
            if len(fields) >= 2 and fields[0].isdigit() and int(fields[0]) == process.pid:
                return not fields[1].startswith("Z")
        return False
    try:
        os.killpg(process.pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def stop_children() -> bool:
    for process in children:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    deadline = time.monotonic() + STOP_TIMEOUT_SECONDS
    while any(group_alive(process) for process in children) and time.monotonic() < deadline:
        time.sleep(0.2)
    still_running = [process.pid for process in children if group_alive(process)]
    for process in children:
        process.poll()
    if still_running:
        print(f"Backtrack process groups {still_running} did not stop; left them running.", file=sys.stderr)
        return False
    return True


def request_stop(_signum: int, _frame: object) -> None:
    global stop_requested
    stop_requested = True


def write_state() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(
        json.dumps({"pid": os.getpid(), "root": str(ROOT), "frontend_port": FRONTEND_PORT, "backend_port": BACKEND_PORT}),
        encoding="utf-8",
    )
    temporary.replace(STATE_FILE)


def clear_own_state() -> None:
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(state, dict) and state.get("pid") == os.getpid() and state.get("root") == str(ROOT):
        STATE_FILE.unlink(missing_ok=True)


def main() -> int:
    state_written = False
    try:
        stop_existing()
        require_free_port(FRONTEND_PORT)
        require_free_port(BACKEND_PORT)
        write_state()
        state_written = True
        children.append(
            subprocess.Popen(
                [str(ROOT / "scripts" / "dev-backend.sh"), str(BACKEND_PORT)],
                cwd=ROOT,
                start_new_session=True,
            )
        )
        children.append(
            subprocess.Popen(
                [str(ROOT / "scripts" / "dev-frontend.sh"), str(FRONTEND_PORT), str(BACKEND_PORT)],
                cwd=ROOT,
                start_new_session=True,
            )
        )
    except (OSError, RuntimeError) as error:
        print(f"Backtrack could not start: {error}", file=sys.stderr)
        while not stop_children():
            time.sleep(1)
        if state_written:
            clear_own_state()
        return 1

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    print(f"Backtrack: http://127.0.0.1:{FRONTEND_PORT} · API docs: http://127.0.0.1:{BACKEND_PORT}/docs")
    try:
        while not stop_requested:
            exited = [process for process in children if process.poll() is not None]
            if exited:
                codes = [process.returncode for process in exited]
                print(f"A Backtrack service exited ({codes}); stopping the other service.", file=sys.stderr)
                break
            time.sleep(0.4)
    finally:
        while not stop_children():
            time.sleep(1)
        clear_own_state()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
