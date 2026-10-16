#!/usr/bin/env python3

"""Local operations used by Vizanti's HTTP API.

This object deliberately is not an rclpy node. The Flask server optionally
passes its ROS node here when ROS2 parameter operations are available.
"""

import errno
import os
import pty
import queue
import re
import secrets
import signal
import subprocess
import termios
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path


BRACKETED_PASTE_SEQUENCE = re.compile(r"(?:\x1b\[|\x9b)\?2004[hl]")
TERMINAL_ESCAPE_SEQUENCE = re.compile(
    r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))"
)
READLINE_CAPTURE_PREFIX = "\x1e__VIZANTI_READLINE__\x1d"
SHELL_OUTPUT_BUFFER_CHARACTERS = 100000


class ShellSession:
    """A single persistent Bash process used by one Shell widget."""

    def __init__(self):
        self._execution_lock = threading.Lock()
        self._input_lock = threading.Lock()
        self._job_lock = threading.Lock()
        self._job = None
        self._transcript_lock = threading.Lock()
        self._transcript = deque()
        self._transcript_characters = 0
        self._next_output_cursor = 0
        self._output_filter_tail = ""
        self._master_fd, slave_fd = pty.openpty()
        attributes = termios.tcgetattr(slave_fd)
        attributes[3] &= ~termios.ECHO
        termios.tcsetattr(slave_fd, termios.TCSANOW, attributes)
        self._process = subprocess.Popen(
            ["/bin/bash", "-i", "+m"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            start_new_session=True,
        )
        os.close(slave_fd)
        self._output = queue.Queue()
        self._reader = threading.Thread(target=self._read_output, daemon=True)
        self._reader.start()
        self.execute(
            "PS1=''; PROMPT_COMMAND=''; set +m; "
            "bind 'set enable-bracketed-paste off'; "
            "__vizanti_capture_line() { "
            "printf '\\036__VIZANTI_READLINE__\\035%s\\035%s\\037' "
            "\"$READLINE_LINE\" \"$READLINE_POINT\"; }; "
            "bind -x '\"\\e[24~\":__vizanti_capture_line'",
            5,
        )

    @property
    def active(self):
        return self._process.poll() is None

    def _read_output(self):
        try:
            while True:
                data = os.read(self._master_fd, 4096)
                if not data:
                    break
                self._output.put(data.decode(errors="replace"))
        except OSError as error:
            if error.errno not in (errno.EBADF, errno.EIO):
                raise
        finally:
            self._output.put(None)

    def _write(self, text):
        with self._input_lock:
            os.write(self._master_fd, text.encode())

    @staticmethod
    def _clean_completion_display(text):
        """Remove terminal redraw sequences from Bash completion output."""
        return TERMINAL_ESCAPE_SEQUENCE.sub(
            "",
            BRACKETED_PASTE_SEQUENCE.sub("", text),
        )

    def execute(self, command, timeout_seconds, on_output=None):
        with self._execution_lock:
            if not self.active:
                raise RuntimeError("The Bash session is no longer running.")

            marker = f"__VIZANTI_SHELL_DONE_{secrets.token_hex(16)}__"
            marker_prefix = f"\x1e{marker}:"
            self._write(
                "bind 'set enable-bracketed-paste off' >/dev/null 2>&1\n"
                f"{command}\n"
                "_vizanti_exit_code=$?\n"
                "bind 'set enable-bracketed-paste off' >/dev/null 2>&1\n"
                f"printf '\\036%s:%s\\037' '{marker}' \"$_vizanti_exit_code\"\n"
            )

            output = []
            pending = ""
            deadline = None if timeout_seconds is None else time.monotonic() + timeout_seconds

            def emit(text):
                if not text:
                    return
                output.append(text)
                if on_output is not None:
                    on_output(text)

            while True:
                try:
                    if deadline is None:
                        line = self._output.get()
                    else:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise subprocess.TimeoutExpired(command, timeout_seconds)
                        line = self._output.get(timeout=remaining)
                except queue.Empty as error:
                    raise subprocess.TimeoutExpired(command, timeout_seconds) from error

                if line is None:
                    raise RuntimeError("The Bash session exited before the command completed.")

                pending += line
                marker_start = pending.find(marker_prefix)
                if marker_start >= 0:
                    marker_end = pending.find("\x1f", marker_start + len(marker_prefix))
                    if marker_end >= 0:
                        try:
                            emit(pending[:marker_start])
                            return (
                                BRACKETED_PASTE_SEQUENCE.sub(
                                    "",
                                    "".join(output),
                                ),
                                int(pending[
                                    marker_start + len(marker_prefix):marker_end
                                ]),
                            )
                        except ValueError as error:
                            raise RuntimeError(
                                "The Bash session returned an invalid exit status."
                            ) from error
                    if marker_start:
                        emit(pending[:marker_start])
                        pending = pending[marker_start:]
                    continue

                retained_characters = max(0, len(pending) - len(marker_prefix))
                if retained_characters:
                    emit(pending[:retained_characters])
                    pending = pending[retained_characters:]

    def complete_readline(self, command, cursor, tab_count):
        if "\n" in command or "\r" in command:
            raise ValueError("Shell completion accepts a single command line.")

        with self._execution_lock:
            if not self.active:
                raise RuntimeError("The Bash session is no longer running.")

            self._write(
                command
                + "\x01"
                + ("\x1b[C" * cursor)
                + ("\t" * tab_count)
                + "\x1b[24~\x15"
            )

            output = []
            pending = ""
            deadline = time.monotonic() + 5
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(command, 5)

                try:
                    line = self._output.get(timeout=remaining)
                except queue.Empty as error:
                    raise subprocess.TimeoutExpired(command, 5) from error

                if line is None:
                    raise RuntimeError("The Bash session exited before completion finished.")

                pending += line
                marker_start = pending.find(READLINE_CAPTURE_PREFIX)
                if marker_start >= 0:
                    marker_end = pending.find(
                        "\x1f",
                        marker_start + len(READLINE_CAPTURE_PREFIX),
                    )
                    if marker_end >= 0:
                        captured = pending[
                            marker_start + len(READLINE_CAPTURE_PREFIX):marker_end
                        ].split("\x1d")
                        if len(captured) != 2 or not captured[1].isdigit():
                            raise RuntimeError("Bash returned an invalid completion result.")
                        return {
                            "command": captured[0],
                            "cursor": int(captured[1]),
                            "display": self._clean_completion_display(
                                "".join(output) + pending[:marker_start],
                            ),
                        }

                    if marker_start:
                        output.append(pending[:marker_start])
                        pending = pending[marker_start:]
                    continue

                retained_characters = max(
                    0,
                    len(pending) - len(READLINE_CAPTURE_PREFIX),
                )
                if retained_characters:
                    output.append(pending[:retained_characters])
                    pending = pending[retained_characters:]

    def _append_transcript_locked(self, text):
        if not text:
            return
        self._next_output_cursor += 1
        self._transcript.append((self._next_output_cursor, text))
        self._transcript_characters += len(text)
        while (
            self._transcript
            and self._transcript_characters > SHELL_OUTPUT_BUFFER_CHARACTERS
        ):
            _, discarded = self._transcript.popleft()
            self._transcript_characters -= len(discarded)

    def _record_output(self, text):
        with self._transcript_lock:
            combined = self._output_filter_tail + text
            retained_characters = min(8, len(combined))
            publishable = combined[:-retained_characters] if retained_characters else combined
            self._output_filter_tail = combined[-retained_characters:] if retained_characters else ""
            self._append_transcript_locked(
                BRACKETED_PASTE_SEQUENCE.sub("", publishable)
            )

    def _flush_recorded_output(self):
        with self._transcript_lock:
            self._append_transcript_locked(
                BRACKETED_PASTE_SEQUENCE.sub("", self._output_filter_tail)
            )
            self._output_filter_tail = ""

    def start_command(self, command):
        with self._job_lock:
            if self._job is not None and self._job["running"]:
                raise RuntimeError("A command is already running in this Shell session.")
            job = {
                "running": True,
                "success": None,
                "exitCode": None,
                "stderr": "",
            }
            self._job = job

        with self._transcript_lock:
            cursor = self._next_output_cursor

        def run():
            try:
                _, exit_code = self.execute(command, None, self._record_output)
                result = {
                    "running": False,
                    "success": exit_code == 0,
                    "exitCode": exit_code,
                    "stderr": "",
                }
            except (OSError, RuntimeError) as error:
                result = {
                    "running": False,
                    "success": False,
                    "exitCode": -1,
                    "stderr": str(error),
                }
            finally:
                self._flush_recorded_output()

            with self._job_lock:
                if self._job is job:
                    self._job.update(result)

        threading.Thread(target=run, daemon=True).start()
        return {
            "success": True,
            "running": True,
            "outputCursor": cursor,
        }

    def read_output(self, cursor):
        if type(cursor) is not int or cursor < 0:
            raise ValueError("Shell output cursor must be a non-negative integer.")

        with self._transcript_lock:
            if cursor > self._next_output_cursor:
                raise ValueError("Shell output cursor is invalid.")
            output = "".join(
                text for entry_cursor, text in self._transcript
                if entry_cursor > cursor
            )
            next_cursor = self._next_output_cursor

        with self._job_lock:
            job = self._job or {
                "running": False,
                "success": True,
                "exitCode": 0,
                "stderr": "",
            }
            return {
                "output": output,
                "outputCursor": next_cursor,
                "running": job["running"],
                "success": job["success"],
                "exitCode": job["exitCode"],
                "stderr": job["stderr"],
            }

    def send_control(self, key):
        if not self.active:
            raise RuntimeError("The Bash session is no longer running.")
        if not isinstance(key, str) or len(key) != 1 or not key.isalpha():
            raise ValueError("Control actions require one letter.")

        control_code = ord(key.upper()) - ord("@")
        if control_code == 3:
            os.killpg(self._process.pid, signal.SIGINT)
        elif control_code == 26:
            os.killpg(self._process.pid, signal.SIGTSTP)
        else:
            self._write(chr(control_code))

        return {"success": True, "action": f"Ctrl+{key.upper()}"}

    def close(self):
        if self.active:
            try:
                os.killpg(self._process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        try:
            self._process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.close(self._master_fd)
        except OSError:
            pass


class ServiceHandler:
    """Run local shell, recording, and ROS parameter operations."""

    def __init__(
        self,
        node,
        allow_shell_commands=True,
        shell_command_max_timeout_seconds=30,
    ):
        self._node = node
        self._allow_shell_commands = allow_shell_commands
        self._shell_command_max_timeout_seconds = shell_command_max_timeout_seconds
        self._recording_process = None
        self._recording_lock = threading.Lock()
        self._parameter_lock = threading.Lock()
        self._shell_sessions = {}
        self._shell_sessions_lock = threading.Lock()

    def _validate_shell_session_id(self, session_id):
        if (
            not isinstance(session_id, str)
            or not session_id
            or len(session_id) > 128
        ):
            raise ValueError("Shell session id must contain 1 to 128 characters.")

    def _validate_shell_command(self, command, allow_empty=False):
        if (
            not isinstance(command, str)
            or (not allow_empty and not command.strip())
            or len(command) > 4096
        ):
            raise ValueError("Command must contain 1 to 4096 characters.")

    def _get_shell_session(self, session_id):
        with self._shell_sessions_lock:
            session = self._shell_sessions.get(session_id)
            if session is None or not session.active:
                if session is not None:
                    session.close()
                session = ShellSession()
                self._shell_sessions[session_id] = session
            return session

    def _reset_shell_session(self, session_id, session):
        with self._shell_sessions_lock:
            if self._shell_sessions.get(session_id) is session:
                self._shell_sessions.pop(session_id, None)
        session.close()

    def execute_command(
        self,
        command,
        timeout_seconds,
        background,
        session_id="default",
        persistent=False,
    ):
        if not self._allow_shell_commands:
            raise PermissionError("Shell command execution is disabled by the server.")
        self._validate_shell_session_id(session_id)
        self._validate_shell_command(command)
        if not isinstance(persistent, bool):
            raise ValueError("Persistent shell mode must be a boolean.")
        if (
            not persistent
            and (
                type(timeout_seconds) is not int
                or not 1 <= timeout_seconds <= self._shell_command_max_timeout_seconds
            )
        ):
            raise ValueError(
                "Command timeout must be between 1 and "
                f"{self._shell_command_max_timeout_seconds} seconds.")
        if not isinstance(background, bool):
            raise ValueError("Command background mode must be a boolean.")
        if persistent and (background or timeout_seconds is not None):
            raise ValueError(
                "Persistent shell mode requires foreground execution without a timeout.")

        session = self._get_shell_session(session_id)
        if persistent:
            try:
                return session.start_command(command)
            except (OSError, RuntimeError) as error:
                raise RuntimeError(str(error)) from error

        shell_command = f"{command} &" if background else command
        try:
            stdout, exit_code = session.execute(
                shell_command,
                None if persistent else timeout_seconds,
            )
            return {
                "success": exit_code == 0,
                "exitCode": exit_code,
                "processId": 0,
                "stdout": stdout,
                "stderr": "",
            }
        except subprocess.TimeoutExpired:
            self._reset_shell_session(session_id, session)
            return {
                "success": False,
                "exitCode": -1,
                "processId": 0,
                "stdout": "",
                "stderr": (
                    f"Command exceeded the {timeout_seconds}-second timeout. "
                    "The Bash session was reset."
                ),
            }
        except (OSError, RuntimeError) as error:
            self._reset_shell_session(session_id, session)
            return {
                "success": False,
                "exitCode": -1,
                "processId": 0,
                "stdout": "",
                "stderr": str(error),
            }

    def read_shell_output(self, session_id, cursor):
        if not self._allow_shell_commands:
            raise PermissionError("Shell command execution is disabled by the server.")
        self._validate_shell_session_id(session_id)

        session = self._get_shell_session(session_id)
        try:
            return session.read_output(cursor)
        except (OSError, RuntimeError) as error:
            self._reset_shell_session(session_id, session)
            raise RuntimeError(str(error)) from error

    def complete_command(self, session_id, command, cursor, tab_count):
        if not self._allow_shell_commands:
            raise PermissionError("Shell command execution is disabled by the server.")
        self._validate_shell_session_id(session_id)
        self._validate_shell_command(command, allow_empty=True)
        if type(cursor) is not int or not 0 <= cursor <= len(command):
            raise ValueError("Shell completion cursor is invalid.")
        if type(tab_count) is not int or not 1 <= tab_count <= 2:
            raise ValueError("Shell completion tab count must be one or two.")
        session = self._get_shell_session(session_id)

        try:
            return session.complete_readline(command, cursor, tab_count)
        except subprocess.TimeoutExpired:
            self._reset_shell_session(session_id, session)
            raise RuntimeError("Shell completion timed out and the Bash session was reset.")
        except (OSError, RuntimeError) as error:
            self._reset_shell_session(session_id, session)
            raise RuntimeError(str(error)) from error

    def send_control(self, session_id, key):
        if not self._allow_shell_commands:
            raise PermissionError("Shell command execution is disabled by the server.")
        self._validate_shell_session_id(session_id)

        session = self._get_shell_session(session_id)
        try:
            return session.send_control(key)
        except (OSError, RuntimeError) as error:
            self._reset_shell_session(session_id, session)
            raise RuntimeError(str(error)) from error

    def get_node_parameters(self, node_name):
        if not isinstance(node_name, str) or not node_name:
            raise ValueError("ROS2 parameter lookup requires a node name.")
        if self._node is None:
            raise RuntimeError("ROS2 parameter operations are unavailable without a ROS node.")

        from rqt_reconfigure_param_api import create_param_client

        param_client = None
        try:
            with self._parameter_lock:
                param_client = create_param_client(self._node, node_name)
                names = param_client.list_parameters()
                descriptors = param_client.describe_parameters(names)
                parameters = param_client.get_parameters(names)
                return [
                    [parameter.name, parameter.value, descriptor.type]
                    for parameter, descriptor in zip(parameters, descriptors)
                    if 0 < descriptor.type < 5
                ]
        finally:
            if param_client is not None:
                param_client.close()

    def set_node_parameter(self, node_name, name, value):
        if not isinstance(node_name, str) or not node_name or not isinstance(name, str) or not name:
            raise ValueError("ROS2 parameter updates require a node and parameter name.")
        if self._node is None:
            raise RuntimeError("ROS2 parameter operations are unavailable without a ROS node.")

        from rclpy.parameter import Parameter
        from rqt_reconfigure_param_api import create_param_client

        param_client = None
        try:
            with self._parameter_lock:
                param_client = create_param_client(self._node, node_name)
                descriptors = param_client.describe_parameters([name])
                if not descriptors or descriptors[0].type == Parameter.Type.NOT_SET:
                    raise LookupError("The requested parameter does not exist.")
                param_type = Parameter.Type(descriptors[0].type)
                if param_type == Parameter.Type.BOOL:
                    if not isinstance(value, bool):
                        raise ValueError("Boolean parameters require a boolean value.")
                elif param_type == Parameter.Type.INTEGER:
                    if type(value) is not int:
                        raise ValueError("Integer parameters require an integer value.")
                elif param_type == Parameter.Type.DOUBLE:
                    if type(value) not in (int, float):
                        raise ValueError("Double parameters require a number value.")
                    value = float(value)
                elif param_type == Parameter.Type.STRING:
                    if not isinstance(value, str):
                        raise ValueError("String parameters require a string value.")
                else:
                    raise ValueError("Only scalar ROS2 parameters are supported.")

                param_client.set_parameters([
                    Parameter(name=name, type_=param_type, value=value),
                ])
                return {"success": True, "status": "Ok."}
        finally:
            if param_client is not None:
                param_client.close()

    def recording_status(self):
        with self._recording_lock:
            if self._recording_process is not None and self._recording_process.poll() is not None:
                self._recording_process = None
            active = self._recording_process is not None
        return {
            "active": active,
            "message": "Bag recording in progress..." if active else "Bag recorder idle.",
        }

    @staticmethod
    def _recording_output_path(path: str) -> str:
        output_path = Path(path).expanduser()
        if not output_path.exists():
            return str(output_path)

        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M")
        candidate = output_path.with_name(f"{output_path.name}-{timestamp}")
        suffix = 1
        while candidate.exists():
            candidate = output_path.with_name(
                f"{output_path.name}-{timestamp}-{suffix}")
            suffix += 1
        return str(candidate)

    def set_recording(self, topics, start, path):
        if not isinstance(start, bool) or not isinstance(topics, list) or not all(
            isinstance(topic, str) and topic for topic in topics
        ) or not isinstance(path, str):
            raise ValueError("Recording requires a start flag, path, and topic names.")

        with self._recording_lock:
            if self._recording_process is not None and self._recording_process.poll() is not None:
                self._recording_process = None
            if start:
                if self._recording_process is not None:
                    return {
                        "success": False,
                        "message": "Already recording, please stop the current recording first.",
                    }
                if not path:
                    raise ValueError("Recording requires an output path.")
                recording_path = self._recording_output_path(path)
                try:
                    self._recording_process = subprocess.Popen(
                        ["ros2", "bag", "record", "-o", recording_path, *topics],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True,
                    )
                except OSError as error:
                    return {"success": False, "message": str(error)}
                return {"success": True, "message": f"Recording started: {recording_path}"}

            if self._recording_process is None:
                return {"success": False, "message": "No active recording found."}
            self._recording_process.terminate()
            try:
                self._recording_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self._recording_process.pid, signal.SIGKILL)
                self._recording_process.wait()
            self._recording_process = None
            return {"success": True, "message": "Recording stopped."}
