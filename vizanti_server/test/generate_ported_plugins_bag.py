#!/usr/bin/env python3
"""Create a deterministic ROS2 bag for ported Vizanti plugin smoke tests.

The topics match test/ported_plugins_settings.json. The bag is intentionally
small, self-contained, and uses only standard ROS2 messages so it can be
recreated with:

    python3 test/generate_ported_plugins_bag.py
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import zlib
from pathlib import Path

from builtin_interfaces.msg import Time
from geometry_msgs.msg import (
    Point,
    Pose,
    PoseArray,
    PoseStamped,
    PoseWithCovarianceStamped,
    TransformStamped,
    Vector3,
)
from nav_msgs.msg import GridCells, MapMetaData, OccupancyGrid, Path as NavPath
from rclpy.serialization import serialize_message
from rosbag2_py import ConverterOptions, SequentialWriter, StorageOptions, TopicMetadata
from sensor_msgs.msg import (
    BatteryState,
    CompressedImage,
    Imu,
    LaserScan,
    PointCloud2,
    PointField,
    Range,
    NavSatFix,
    NavSatStatus,
    Temperature,
)
from std_msgs.msg import Float64, Header, String
from tf2_msgs.msg import TFMessage
from visualization_msgs.msg import Marker, MarkerArray


BASE_TIME_NS = 1_700_000_000_000_000_000


def stamp(offset_ns: int) -> Time:
    timestamp = BASE_TIME_NS + offset_ns
    return Time(sec=timestamp // 1_000_000_000, nanosec=timestamp % 1_000_000_000)


def message_header(frame_id: str, offset_ns: int) -> Header:
    return Header(stamp=stamp(offset_ns), frame_id=frame_id)


def write(writer: SequentialWriter, topic: str, message: object, offset_ns: int) -> None:
    writer.write(topic, serialize_message(message), BASE_TIME_NS + offset_ns)


def add_topic(writer: SequentialWriter, name: str, message_type: str) -> None:
    writer.create_topic(TopicMetadata(
        name=name,
        type=message_type,
        serialization_format="cdr",
        offered_qos_profiles="",
    ))


def png_pixel(red: int, green: int, blue: int) -> bytes:
    """Return a valid opaque one-pixel PNG without external image tooling."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00" + bytes((red, green, blue, 255))))
            + chunk(b"IEND", b""))


def create_bag(output: Path) -> None:
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing bag: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    writer = SequentialWriter()
    writer.open(
        StorageOptions(uri=str(output), storage_id="sqlite3"),
        ConverterOptions(input_serialization_format="cdr", output_serialization_format="cdr"),
    )

    topics = {
        "/tf": "tf2_msgs/msg/TFMessage",
        "/test/altitude": "std_msgs/msg/Float64",
        "/test/battery": "sensor_msgs/msg/BatteryState",
        "/test/image": "sensor_msgs/msg/CompressedImage",
        "/test/grid_cells": "nav_msgs/msg/GridCells",
        "/test/fix": "sensor_msgs/msg/NavSatFix",
        "/test/inspection": "std_msgs/msg/String",
        "/test/map": "nav_msgs/msg/OccupancyGrid",
        "/test/markers": "visualization_msgs/msg/MarkerArray",
        "/test/imu": "sensor_msgs/msg/Imu",
        "/test/path": "nav_msgs/msg/Path",
        "/test/point_cloud": "sensor_msgs/msg/PointCloud2",
        "/test/pose_array": "geometry_msgs/msg/PoseArray",
        "/test/pose_with_covariance": "geometry_msgs/msg/PoseWithCovarianceStamped",
        "/test/range": "sensor_msgs/msg/Range",
        "/test/scan": "sensor_msgs/msg/LaserScan",
        "/test/temperature": "sensor_msgs/msg/Temperature",
    }
    for name, message_type in topics.items():
        add_topic(writer, name, message_type)

    red_png = png_pixel(220, 45, 45)
    blue_png = png_pixel(40, 100, 230)
    map_patterns = (
        [0, 0, 0, 100, 0, -1, -1, 100, 0, 0, 0, 0],
        [100, 0, 0, 0, 100, 0, -1, 0, 100, 0, 0, 0],
    )
    cell_patterns = (
        [(0.0, 0.0), (0.5, 0.0), (0.0, 0.5)],
        [(1.0, 1.0), (1.5, 1.0), (1.0, 1.5)],
    )

    for second in range(16):
        offset = second * 1_000_000_000
        altitude = 1.0 if (second // 5) % 2 == 0 else 3.0
        transform = TransformStamped()
        transform.header = message_header("map", offset)
        transform.child_frame_id = "base_link"
        transform.transform.translation.x = second * 0.2
        transform.transform.translation.z = altitude
        transform.transform.rotation.w = 1.0
        write(writer, "/tf", TFMessage(transforms=[transform]), offset)

        tracker = TransformStamped()
        tracker.header = message_header("map", offset)
        tracker.child_frame_id = "pose_tracker"
        route = ((-1.0, 5.0), (1.0, 5.0), (1.0, 7.0), (-1.0, 7.0))
        tracker.transform.translation.x, tracker.transform.translation.y = route[second % len(route)]
        tracker.transform.rotation.w = 1.0
        write(writer, "/tf", TFMessage(transforms=[tracker]), offset)

        range_sensor = TransformStamped()
        range_sensor.header = message_header("map", offset)
        range_sensor.child_frame_id = "range_sensor"
        range_sensor.transform.translation.x = 4.0
        range_sensor.transform.translation.y = -3.0
        range_sensor.transform.rotation.w = 1.0
        write(writer, "/tf", TFMessage(transforms=[range_sensor]), offset)

        pointcloud_sensor = TransformStamped()
        pointcloud_sensor.header = message_header("map", offset)
        pointcloud_sensor.child_frame_id = "pointcloud_sensor"
        pointcloud_sensor.transform.translation.x = -4.0
        pointcloud_sensor.transform.translation.y = -3.0
        pointcloud_sensor.transform.rotation.w = 1.0
        write(writer, "/tf", TFMessage(transforms=[pointcloud_sensor]), offset)

        scan_sensor = TransformStamped()
        scan_sensor.header = message_header("map", offset)
        scan_sensor.child_frame_id = "scan_sensor"
        scan_sensor.transform.translation.x = 4.0
        scan_sensor.transform.translation.y = 3.0
        scan_sensor.transform.rotation.w = 1.0
        write(writer, "/tf", TFMessage(transforms=[scan_sensor]), offset)

        battery = BatteryState()
        battery.header = message_header("base_link", offset)
        battery.percentage = (1.0, 0.6, 0.2)[second % 3]
        battery.voltage = 20.0 + battery.percentage * 5.0
        battery.current = -1.2
        battery.charge = battery.percentage * 10.0
        battery.capacity = 10.0
        battery.cell_voltage = [battery.voltage / 6.0] * 6
        battery.power_supply_status = (BatteryState.POWER_SUPPLY_STATUS_FULL
                                       if battery.percentage == 1.0
                                       else BatteryState.POWER_SUPPLY_STATUS_DISCHARGING)
        battery.power_supply_health = BatteryState.POWER_SUPPLY_HEALTH_GOOD
        battery.power_supply_technology = BatteryState.POWER_SUPPLY_TECHNOLOGY_LION
        write(writer, "/test/battery", battery, offset)

        imu = Imu()
        imu.header = message_header("base_link", offset)
        yaw = math.radians(30 * second)
        imu.orientation.z = math.sin(yaw / 2.0)
        imu.orientation.w = math.cos(yaw / 2.0)
        imu.angular_velocity.z = math.radians(30)
        imu.linear_acceleration.z = 9.81
        write(writer, "/test/imu", imu, offset)

        temperature = Temperature()
        temperature.header = message_header("base_link", offset)
        temperature.temperature = (15.0, 45.0, 80.0)[second % 3]
        temperature.variance = 0.25
        write(writer, "/test/temperature", temperature, offset)

    for second in range(0, 16, 5):
        offset = second * 1_000_000_000
        state = (second // 5) % 2
        write(writer, "/test/altitude", Float64(data=(1.0, 3.0)[state]), offset)

        image = CompressedImage()
        image.header = message_header("camera_link", offset)
        image.format = "png"
        image.data = (red_png, blue_png)[state]
        write(writer, "/test/image", image, offset)

        occupancy = OccupancyGrid()
        occupancy.header = message_header("map", offset)
        occupancy.info = MapMetaData()
        occupancy.info.resolution = 0.5
        occupancy.info.width = 4
        occupancy.info.height = 3
        occupancy.info.origin = Pose()
        occupancy.info.origin.orientation.w = 1.0
        occupancy.data = map_patterns[state]
        write(writer, "/test/map", occupancy, offset)

        fix = NavSatFix()
        fix.header = message_header("base_link", offset)
        fix.status.status = NavSatStatus.STATUS_FIX
        fix.status.service = NavSatStatus.SERVICE_GPS
        fix.latitude = (45.8150, 45.8153)[state]
        fix.longitude = (15.9819, 15.9822)[state]
        fix.altitude = 120.0
        fix.position_covariance = [0.25, 0.0, 0.0, 0.0, 0.25, 0.0, 0.0, 0.0, 1.0]
        fix.position_covariance_type = NavSatFix.COVARIANCE_TYPE_DIAGONAL_KNOWN
        write(writer, "/test/fix", fix, offset)

    for second in range(0, 16, 2):
        offset = second * 1_000_000_000
        state = (second // 2) % 2
        cells = GridCells()
        cells.header = message_header("map", offset)
        cells.cell_width = 0.5
        cells.cell_height = 0.5
        cells.cells = [Point(x=x, y=y, z=0.0) for x, y in cell_patterns[state]]
        write(writer, "/test/grid_cells", cells, offset)

        marker = Marker()
        marker.header = message_header("map", offset)
        marker.ns = "test"
        marker.id = 1
        marker.type = Marker.SPHERE
        marker.action = Marker.ADD
        marker.pose.position.x = 1.0 + state * 2.0
        marker.pose.position.y = 2.0 - state
        marker.pose.orientation.w = 1.0
        marker.scale = Vector3(x=0.5, y=0.5, z=0.5)
        marker.color.r = float(1 - state)
        marker.color.g = float(state)
        marker.color.b = 0.2
        marker.color.a = 1.0
        write(writer, "/test/markers", MarkerArray(markers=[marker]), offset)

        inspection = json.dumps({"sequence": second // 2, "state": ("left", "right")[state]})
        write(writer, "/test/inspection", String(data=inspection), offset)

        range_message = Range()
        range_message.header = message_header("range_sensor", offset)
        range_message.radiation_type = Range.ULTRASOUND
        range_message.field_of_view = math.radians(30)
        range_message.min_range = 0.2
        range_message.max_range = 4.0
        range_message.range = (1.0, 3.0)[state]
        write(writer, "/test/range", range_message, offset)

        point_cloud = PointCloud2()
        point_cloud.header = message_header("pointcloud_sensor", offset)
        point_cloud.height = 1
        point_cloud.width = 4
        point_cloud.fields = [
            PointField(name="x", offset=0, datatype=PointField.FLOAT32, count=1),
            PointField(name="y", offset=4, datatype=PointField.FLOAT32, count=1),
            PointField(name="z", offset=8, datatype=PointField.FLOAT32, count=1),
            PointField(name="intensity", offset=12, datatype=PointField.FLOAT32, count=1),
        ]
        point_cloud.is_bigendian = False
        point_cloud.point_step = 16
        point_cloud.row_step = point_cloud.width * point_cloud.point_step
        point_cloud.is_dense = True
        cloud_points = ((0.0, 0.0), (0.5, 0.4), (1.0, 0.0), (0.5, -0.4))
        point_cloud.data = list(b"".join(
            struct.pack("<ffff", x, y + state * 0.5, 0.1 * index, float(index))
            for index, (x, y) in enumerate(cloud_points)
        ))
        write(writer, "/test/point_cloud", point_cloud, offset)

        scan = LaserScan()
        scan.header = message_header("scan_sensor", offset)
        scan.angle_min = -math.pi / 4.0
        scan.angle_max = math.pi / 4.0
        scan.angle_increment = math.pi / 8.0
        scan.time_increment = 0.0
        scan.scan_time = 2.0
        scan.range_min = 0.2
        scan.range_max = 5.0
        scan.ranges = (1.0, 1.5, 2.0, 1.5, 1.0) if state == 0 else (2.0, 1.0, 0.7, 1.0, 2.0)
        scan.intensities = [1.0] * len(scan.ranges)
        write(writer, "/test/scan", scan, offset)

        pose_array = PoseArray()
        pose_array.header = message_header("map", offset)
        pose_patterns = (
            ((-5.0, 3.0), (-4.0, 3.5), (-3.0, 3.0)),
            ((-5.0, 4.0), (-4.0, 4.5), (-3.0, 4.0)),
        )
        pose_array.poses = [
            Pose(position=Point(x=x, y=y, z=0.0))
            for x, y in pose_patterns[state]
        ]
        for pose in pose_array.poses:
            yaw = state * math.pi / 2.0
            pose.orientation.z = math.sin(yaw / 2.0)
            pose.orientation.w = math.cos(yaw / 2.0)
        write(writer, "/test/pose_array", pose_array, offset)

        covariance_pose = PoseWithCovarianceStamped()
        covariance_pose.header = message_header("map", offset)
        covariance_pose.pose.pose.position.x = (4.0, 5.0)[state]
        covariance_pose.pose.pose.position.y = (3.0, 4.0)[state]
        yaw = (0.0, math.pi / 2.0)[state]
        covariance_pose.pose.pose.orientation.z = math.sin(yaw / 2.0)
        covariance_pose.pose.pose.orientation.w = math.cos(yaw / 2.0)
        covariance_pose.pose.covariance[0] = 0.09
        covariance_pose.pose.covariance[7] = 0.04
        covariance_pose.pose.covariance[35] = 0.16
        write(writer, "/test/pose_with_covariance", covariance_pose, offset)

    for second in range(0, 16, 5):
        offset = second * 1_000_000_000
        state = (second // 5) % 2
        path = NavPath()
        path.header = message_header("map", offset)
        points = ((-4.0, -3.0), (-2.0, -3.0), (0.0, -3.0)) if state == 0 else ((-4.0, -3.0), (-2.0, -2.0), (0.0, -1.0))
        for x, y in points:
            pose = PoseStamped()
            pose.header = message_header("map", offset)
            pose.pose.position.x = x
            pose.pose.position.y = y
            pose.pose.orientation.w = 1.0
            path.poses.append(pose)
        write(writer, "/test/path", path, offset)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("ported_plugins_ros2_bag"),
        help="new rosbag directory to create",
    )
    args = parser.parse_args()
    create_bag(args.output)
    print(f"Created ROS2 test bag: {args.output}")


if __name__ == "__main__":
    main()
