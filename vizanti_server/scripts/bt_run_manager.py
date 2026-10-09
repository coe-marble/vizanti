"""Persistent, bounded behavior-tree runtime recordings."""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from flask import jsonify, request


class BtRunManager:
    """Stores behavior-tree runs as validated JSON files outside XML sources."""

    MAX_RUN_BYTES = 64 * 1024 * 1024
    MAX_EVENTS = 250_000
    RUN_ID = re.compile(r"^[0-9a-f]{32}$")

    def __init__(self, root: str = "") -> None:
        self.root: Path | None = None
        if root:
            self.set_root(root)

    def set_root(self, root: str) -> bool:
        candidate = Path(os.path.expanduser(root)).resolve()
        try:
            candidate.mkdir(parents=True, exist_ok=True)
        except OSError:
            return False
        if not candidate.is_dir():
            return False
        self.root = candidate
        return True

    def create_run(self) -> Any:
        payload = self._payload()
        if payload is None:
            return jsonify(error="Run payload must be a JSON object."), 400

        run_id = uuid.uuid4().hex
        run = {
            "version": 1,
            "id": run_id,
            "metadata": payload.get("metadata", {}),
            "events": [],
            "outcome": None,
            "truncated": False,
        }
        try:
            self._validate_run(run, require_matching_id=False)
            self._write_run(run_id, run)
        except (OSError, ValueError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(id=run_id)

    def save_run(self, run_id: str) -> Any:
        payload = self._payload()
        if payload is None:
            return jsonify(error="Run payload must be a JSON object."), 400
        try:
            self._validate_run_id(run_id)
            if not self._run_path(run_id).is_file():
                return jsonify(error="Run was not found."), 404
            payload["id"] = run_id
            self._validate_run(payload, require_matching_id=True)
            self._write_run(run_id, payload)
        except (OSError, ValueError) as error:
            return jsonify(error=str(error)), 400
        return jsonify(id=run_id, size=self._run_path(run_id).stat().st_size)

    def list_runs(self) -> Any:
        if self.root is None:
            return jsonify(error="Behavior-tree run storage is not configured."), 409

        run_paths: list[tuple[int, Path]] = []
        for path in self.root.glob("*.json"):
            try:
                run_paths.append((path.stat().st_mtime_ns, path))
            except OSError:
                continue

        runs: list[dict[str, Any]] = []
        for _, path in sorted(run_paths, key=lambda item: item[0], reverse=True):
            try:
                run = json.loads(path.read_text(encoding="utf-8"))
                metadata = run.get("metadata", {})
                if not isinstance(metadata, dict):
                    continue
                runs.append({
                    "id": run.get("id", path.stem),
                    "path": metadata.get("path", ""),
                    "mode": metadata.get("mode", ""),
                    "started_at": metadata.get("started_at", ""),
                    "outcome": run.get("outcome"),
                    "event_count": len(run.get("events", [])),
                    "truncated": bool(run.get("truncated", False)),
                    "size": path.stat().st_size,
                })
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                continue
        return jsonify(runs=runs)

    def get_run(self, run_id: str) -> Any:
        try:
            self._validate_run_id(run_id)
            path = self._run_path(run_id)
            if not path.is_file():
                return jsonify(error="Run was not found."), 404
            if path.stat().st_size > self.MAX_RUN_BYTES:
                return jsonify(error="Run exceeds the maximum supported size."), 413
            return jsonify(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            return jsonify(error=str(error)), 400

    def _payload(self) -> dict[str, Any] | None:
        payload = request.get_json(silent=True)
        return payload if isinstance(payload, dict) else None

    def _run_path(self, run_id: str) -> Path:
        if self.root is None:
            raise ValueError("Behavior-tree run storage is not configured.")
        return self.root / f"{run_id}.json"

    def _validate_run_id(self, run_id: str) -> None:
        if not isinstance(run_id, str) or not self.RUN_ID.fullmatch(run_id):
            raise ValueError("Run ID is invalid.")

    def _validate_run(self, run: dict[str, Any], require_matching_id: bool) -> None:
        if not isinstance(run.get("version"), int) or run["version"] != 1:
            raise ValueError("Run version is invalid.")
        if require_matching_id:
            self._validate_run_id(run.get("id"))
        metadata = run.get("metadata")
        events = run.get("events")
        if not isinstance(metadata, dict) or not isinstance(events, list):
            raise ValueError("Run metadata and events are required.")
        if len(events) > self.MAX_EVENTS:
            raise ValueError("Run contains too many events.")
        if not isinstance(run.get("truncated", False), bool):
            raise ValueError("Run truncation marker is invalid.")
        if run.get("outcome") is not None and not isinstance(run["outcome"], dict):
            raise ValueError("Run outcome is invalid.")
        for event in events:
            if not isinstance(event, dict) or not isinstance(event.get("type"), str):
                raise ValueError("Run contains an invalid event.")

        encoded = json.dumps(run, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if len(encoded) > self.MAX_RUN_BYTES:
            raise ValueError("Run exceeds the 64 MiB recording limit.")

    def _write_run(self, run_id: str, run: dict[str, Any]) -> None:
        path = self._run_path(run_id)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(run, separators=(",", ":"), ensure_ascii=False),
                             encoding="utf-8")
        temporary.replace(path)


def register_routes(app: Any, base_url: str, run_manager: BtRunManager) -> None:
    app.add_url_rule(base_url + "/bt/runs", "create_bt_run", run_manager.create_run,
                     methods=["POST"])
    app.add_url_rule(base_url + "/bt/runs", "list_bt_runs", run_manager.list_runs)
    app.add_url_rule(base_url + "/bt/runs/<run_id>", "get_bt_run", run_manager.get_run)
    app.add_url_rule(base_url + "/bt/runs/<run_id>", "save_bt_run", run_manager.save_run,
                     methods=["PUT"])
