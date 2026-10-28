import json
from types import SimpleNamespace

import pytest

from scripts import run_stack


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
