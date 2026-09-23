#!/usr/bin/env python3

"""Local operations used by Vizanti's HTTP API.

This object deliberately is not an rclpy node. The Flask server optionally
passes its ROS node here when ROS2 parameter operations are available.
"""

import os
import signal
import subprocess
import threading
from datetime import datetime
from pathlib import Path


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

    def execute_command(self, command, timeout_seconds, background):
        if not self._allow_shell_commands:
            raise PermissionError("Shell command execution is disabled by the server.")
        if not isinstance(command, str) or not command.strip() or len(command) > 4096:
            raise ValueError("Command must contain 1 to 4096 characters.")
        if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= self._shell_command_max_timeout_seconds:
            raise ValueError(
                "Command timeout must be between 1 and "
                f"{self._shell_command_max_timeout_seconds} seconds.")
        if not isinstance(background, bool):
            raise ValueError("Command background mode must be a boolean.")

        process = None
        try:
            if background:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    executable="/bin/sh",
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return {
                    "success": True,
                    "exitCode": 0,
                    "processId": process.pid,
                    "stdout": "",
                    "stderr": "",
                }

            process = subprocess.Popen(
                command,
                shell=True,
                executable="/bin/sh",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
            )
            stdout, stderr = process.communicate(timeout=timeout_seconds)
            return {
                "success": process.returncode == 0,
                "exitCode": process.returncode,
                "processId": 0,
                "stdout": stdout,
                "stderr": stderr,
            }
        except subprocess.TimeoutExpired:
            if process is not None:
                os.killpg(process.pid, signal.SIGKILL)
                stdout, stderr = process.communicate()
            else:
                stdout, stderr = "", ""
            return {
                "success": False,
                "exitCode": -1,
                "processId": 0,
                "stdout": stdout,
                "stderr": f"Command exceeded the {timeout_seconds}-second timeout.\n{stderr}",
            }
        except OSError as error:
            return {
                "success": False,
                "exitCode": -1,
                "processId": 0,
                "stdout": "",
                "stderr": str(error),
            }

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
