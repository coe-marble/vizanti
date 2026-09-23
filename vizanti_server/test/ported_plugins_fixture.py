#!/usr/bin/env python3

"""Live ROS2 fixture for the ported-plugin manual smoke-test scene."""

from __future__ import annotations

import rclpy
from geometry_msgs.msg import (
    PolygonStamped,
    Pose,
    PoseStamped,
    PoseWithCovarianceStamped,
    Twist,
)
from nav_msgs.msg import Path
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix
from std_msgs.msg import Bool


class PortedPluginsFixture(Node):
    """Provides editable parameters and observes each manual widget output."""

    def __init__(self) -> None:
        super().__init__("vizanti_test_fixture")
        self.declare_parameter("enabled", True)
        self.declare_parameter("integer_gain", 5)
        self.declare_parameter("double_gain", 1.5)
        self.declare_parameter("label", "Vizanti test fixture")

        subscriptions = {
            "/test/enabled": Bool,
            "/test/area": PolygonStamped,
            "/test/initialpose": PoseWithCovarianceStamped,
            "/test/goal": Pose,
            "/test/goto_fix": NavSatFix,
            "/test/goto_pose": PoseStamped,
            "/test/survey_path": Path,
            "/test/cmd_vel": Twist,
            "/test/waypoint_path": Path,
        }
        self._subscriptions = [
            self.create_subscription(message_type, topic, self._observer(topic), 10)
            for topic, message_type in subscriptions.items()
        ]

    def _observer(self, topic: str):
        def observe(message: object) -> None:
            del message
            self.get_logger().info(f"Received manual widget output on {topic}.")

        return observe


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    fixture = PortedPluginsFixture()
    try:
        rclpy.spin(fixture)
    except KeyboardInterrupt:
        pass
    finally:
        fixture.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
