# Vizanti ported-plugin smoke-test scene

`ported_plugins_settings.json` contains every addable widget except the
permanent Add palette. It is safe to import: it never sends a command, starts
a recording, or runs the saved shell command on its own.

## Start the scene

From `vizanti_server`:

1. Import `test/ported_plugins_settings.json` in Vizanti Settings.
2. Start the live output fixture with
   `python3 test/ported_plugins_fixture.py`.
3. Play passive data with
   `ros2 bag play test/ported_plugins_ros2_bag --loop`.
4. In BT Manager, select **Configure** to use
   `test/ported_plugins_behavior_trees`; open `smoke_test.xml`.

The fixture node is named `/vizanti_test_fixture`. It exposes editable
`enabled`, `integer_gain`, `double_gain`, and `label` parameters, and logs all
manual widget outputs below. Stop it with Ctrl-C after the smoke test.

## Passive bag behavior

| Widget | Input | Expected result |
| --- | --- | --- |
| Altimeter | `/test/altitude`, `base_link` TF | Alternates 1 m and 3 m every 5 s. |
| Battery | `/test/battery` | Cycles full, 60%, and 20% each second. |
| Compressed Image | `/test/image` | Alternates red and blue images every 5 s; stays stretched at `200 × 100` in the lower right. |
| Grid / Speedometer / Robot Model | `base_link` TF | Grid and robot follow the frame; speed is about 0.2 m/s. |
| Grid Cells | `/test/grid_cells` | Alternates two three-cell patterns every 2 s. |
| Inspector | `/test/inspection` | Raw JSON payload changes every 2 s. |
| Map | `/test/map` | Occupancy pattern alternates every 5 s. |
| Marker Array | `/test/markers` | Sphere position and colour alternate every 2 s. |
| Navball | `/test/imu` | Heading advances 30 degrees per second. |
| Odom | `pose_tracker` TF | Dedicated frame traces a square above the centre. |
| Path | `/test/path` | Lower-left path alternates every 5 s. |
| Point Cloud | `/test/point_cloud`, `pointcloud_sensor` TF | Four-point cloud shape changes every 2 s. |
| Pose Array | `/test/pose_array` | Three arrows alternate in the upper left every 2 s. |
| Pose With Covariance | `/test/pose_with_covariance` | Position, heading, and covariance alternate every 2 s. |
| Range | `/test/range`, `range_sensor` TF | Range cone alternates 1 m and 3 m every 2 s. |
| Scan | `/test/scan`, `scan_sensor` TF | Five-ray scan shape alternates every 2 s. |
| Satellite | `/test/fix` | Nearby NavSatFix samples alternate every 5 s. |
| Temperature | `/test/temperature` | Cycles 15, 45, and 80 °C each second. |
| TF | `/tf` | Renders `map`, `base_link`, `pose_tracker`, `range_sensor`, `pointcloud_sensor`, and `scan_sensor`. |

## Manual output checks

The bag deliberately does not publish any output endpoint. Perform each action
once and confirm the fixture logs the named topic and message type.

| Widget | Action | Fixture topic |
| --- | --- | --- |
| Button | Toggle **Enable**. | `/test/enabled` (`Bool`) |
| Area | Draw and publish an area. | `/test/area` (`PolygonStamped`) |
| Initial Pose | Click for zero heading; drag for a chosen heading. | `/test/initialpose` (`PoseWithCovarianceStamped`) |
| Simple Goal | Click a destination. | `/test/goal` (`Pose`) |
| Satellite | Enable **Use manual fix** and set the map's `(0, 0)` geodetic origin; then send Go To Point as PoseStamped and, after switching mode, as NavSatFix. | `/test/goto_pose`, `/test/goto_fix` |
| Survey | Draw a polygon and start the survey. | `/test/survey_path` (`Path`) |
| Teleop | Move the joystick briefly. | `/test/cmd_vel` (`Twist`) |
| Waypoints | Add points and send the route. | `/test/waypoint_path` (`Path`) |

## Local and application widgets

- **Add** is the permanent palette; open it and confirm discovery/manual entry
  controls are available.
- **Folder** is included in the scene; open and close it and verify grouped
  child icons remain usable.
- **Reconfigure** selects `/vizanti_test_fixture`; edit each of its four
  parameters and refresh to confirm the changed values persist.
- **Recorder** is configured with three passive topics and
  `/tmp/vizanti-test-recording`. Start and stop it manually. On the first
  recording it writes to that exact path; if that bag already exists, it writes
  to `/tmp/vizanti-test-recording-YYYY-MM-DD-HH-MM`. It must not start merely
  by importing settings.
- **Shell** is configured with `printf 'vizanti shell ready\\n'`. Click Run
  manually and confirm the output; it must never run on import.
- **BT Manager** uses the included `smoke_test.xml`. Configure its root, open
  the file, validate it, and confirm no network access is needed.
- **Settings** verifies import/export and fixed frame `map`.

Rosbag playback covers passive adapter conversion and rendering. The fixture
node covers Reconfigure and all user-published ROS messages; Shell and
Recorder are explicitly manual local-server checks.
