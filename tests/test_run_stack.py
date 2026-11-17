import errno
import json
from types import SimpleNamespace

import pytest

from scripts import run_stack


class SocketStub:
    def __init__(self, error):
        self.error = error

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def bind(self, _address):
        raise self.error


def test_require_free_port_reports_only_real_port_conflicts(monkeypatch):
    conflict = OSError(errno.EADDRINUSE, "Address already in use")
    monkeypatch.setattr(run_stack.socket, "socket", lambda *_args: SocketStub(conflict))

    with pytest.raises(RuntimeError, match="Port 4003 is already in use"):
        run_stack.require_free_port(4003)


def test_require_free_port_preserves_permission_errors(monkeypatch):
    blocked = PermissionError(errno.EPERM, "Operation not permitted")
    monkeypatch.setattr(run_stack.socket, "socket", lambda *_args: SocketStub(blocked))

    with pytest.raises(PermissionError, match="Operation not permitted"):
        run_stack.require_free_port(4003)


def test_stop_existing_rejects_non_object_state(tmp_path, monkeypatch):
    state_file = tmp_path / "run.json"
    state_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(run_stack, "STATE_FILE", state_file)

    with pytest.raises(RuntimeError, match="Cannot verify Backtrack's saved runner state"):
        run_stack.stop_existing()


def test_stop_existing_preserves_state_for_another_project(tmp_path, monkeypatch):
    state_file = tmp_path / "run.json"
    state_file.write_text(json.dumps({"pid": 1, "root": "/another/project"}), encoding="utf-8")
    monkeypatch.setattr(run_stack, "STATE_FILE", state_file)

    with pytest.raises(RuntimeError, match="different project"):
        run_stack.stop_existing()

    assert state_file.exists()


def test_group_alive_ignores_exited_zombie_members(monkeypatch):
    monkeypatch.setattr(
        run_stack.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="42 Z\n"),
    )

    assert not run_stack.group_alive(SimpleNamespace(pid=42))


def test_group_alive_waits_for_live_descendants_after_group_leader_exits(monkeypatch):
    monkeypatch.setattr(
        run_stack.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="42 Z\n42 S\n"),
    )

    assert run_stack.group_alive(SimpleNamespace(pid=42))
