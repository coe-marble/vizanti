import '../../lib/roslib.min.js';
import { rosbridge } from '../rosbridge.js';
import { serverApi } from '../server_api.js';
import { ENDPOINT_TYPE, assertAdapterContract } from './contract.js';
import { GUI_MESSAGE_TYPE, createBatteryState, createBool, createEmpty, createFloat, createGridCells, createImage, createImu, createLaserScan, createMarkerArray, createNavSatFix, createOdometry, createOccupancyGrid, createPath, createPointCloud, createPolygon, createPose, createPoseArray, createPoseStamped, createPoseWithCovariance, createRange, createTemperature, createTwist } from '../gui_messages.js';
import { binaryToUint8Array } from './binary.js';
import { binaryToBase64 } from './encoded_image.js';
import { createRosTf } from './tf_ros.js';

const floatMappings = Object.freeze({
	"std_msgs/msg/Float32": Object.freeze({
		fromNative(message) { return createFloat(message.data); },
		toNative(message) { return { data: message.value }; },
	}),
	"std_msgs/msg/Float64": Object.freeze({
		fromNative(message) { return createFloat(message.data); },
		toNative(message) { return { data: message.value }; },
	}),
});

const boolMappings = Object.freeze({
	"std_msgs/msg/Bool": Object.freeze({
		fromNative(message) { return createBool(message.data); },
		toNative(message) { return { data: message.value }; },
	}),
});

const emptyMappings = Object.freeze({
	"std_msgs/msg/Empty": Object.freeze({
		fromNative() { return createEmpty(); },
		toNative() { return {}; },
	}),
});

const poseMappings = Object.freeze({
	"geometry_msgs/msg/Pose": Object.freeze({
		fromNative(message) {
			return createPose({ frameId: "", position: message.position, orientation: message.orientation, stamp: { sec: 0, nanosec: 0 } });
		},
		toNative(message) { return { position: message.position, orientation: message.orientation }; },
	}),
	"geometry_msgs/msg/PoseStamped": Object.freeze({
		fromNative(message) {
			return createPose({
				frameId: message.header.frame_id,
				position: message.pose.position,
				orientation: message.pose.orientation,
				stamp: message.header.stamp,
			});
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				position: message.position, orientation: message.orientation,
			} };
		},
	}),
	"geometry_msgs/msg/PoseWithCovarianceStamped": Object.freeze({
		fromNative(message) {
			return createPose({ frameId: message.header.frame_id, position: message.pose.pose.position, orientation: message.pose.pose.orientation, stamp: message.header.stamp });
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				pose: { position: message.position, orientation: message.orientation }, covariance: Array(36).fill(0),
			} };
		},
	}),
});

const poseStampedMappings = Object.freeze({
	"geometry_msgs/msg/PoseStamped": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const pose = message.pose || {};
			return createPoseStamped({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				position: pose.position,
				orientation: pose.orientation,
			});
		},
		toNative(message) {
			return {
				header: { stamp: message.stamp, frame_id: message.frameId },
				pose: { position: message.position, orientation: message.orientation },
			};
		},
	}),
});

const poseWithCovarianceMappings = Object.freeze({
	"geometry_msgs/msg/PoseStamped": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const pose = message.pose || {};
			return createPoseWithCovariance({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				position: pose.position,
				orientation: pose.orientation,
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				covariance: Array(36).fill(0),
			});
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				position: message.position, orientation: message.orientation,
			} };
		},
	}),
	"geometry_msgs/msg/PoseWithCovarianceStamped": Object.freeze({
		fromNative(message) {
			return createPoseWithCovariance({
				frameId: message.header.frame_id,
				position: message.pose.pose.position,
				orientation: message.pose.pose.orientation,
				stamp: message.header.stamp,
				covariance: message.pose.covariance,
			});
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				pose: { position: message.position, orientation: message.orientation }, covariance: message.covariance,
			} };
		},
	}),
});

const odometryMappings = Object.freeze({
	"nav_msgs/msg/Odometry": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const pose = message.pose && message.pose.pose ? message.pose.pose : {};
			return createOdometry({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				position: pose.position,
				orientation: pose.orientation,
				childFrameId: typeof message.child_frame_id === "string" ? message.child_frame_id : "",
			});
		},
		toNative() {
			throw new TypeError("vizanti/Odometry is read-only.");
		},
	}),
});

const pathMappings = Object.freeze({
	"nav_msgs/msg/Path": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const stamp = header.stamp || { sec: 0, nanosec: 0 };
			const frameId = typeof header.frame_id === "string" ? header.frame_id : "";
			return createPath({
				frameId,
				stamp,
				poses: Array.isArray(message.poses) ? message.poses.map((poseStamped) => {
					const poseHeader = poseStamped.header || header;
					const pose = poseStamped.pose || {};
					return {
						frameId: typeof poseHeader.frame_id === "string" ? poseHeader.frame_id : frameId,
						stamp: poseHeader.stamp || stamp,
						position: pose.position,
						orientation: pose.orientation,
					};
				}) : [],
			});
		},
		toNative(message) {
			return {
				header: { stamp: message.stamp, frame_id: message.frameId },
				poses: message.poses.map((pose) => ({
					header: { stamp: pose.stamp, frame_id: pose.frameId },
					pose: { position: pose.position, orientation: pose.orientation },
				})),
			};
		},
	}),
});

const pointCloudMappings = Object.freeze({
	"sensor_msgs/msg/PointCloud2": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createPointCloud({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				width: message.width,
				height: message.height,
				fields: Array.isArray(message.fields) ? message.fields : [],
				isBigEndian: message.is_bigendian === true,
				pointStep: message.point_step,
				rowStep: message.row_step,
				data: binaryToUint8Array(message.data),
				isDense: message.is_dense === true,
			});
		},
		toNative() { throw new TypeError("vizanti/PointCloud is read-only."); },
	}),
});

const laserScanMappings = Object.freeze({
	"sensor_msgs/msg/LaserScan": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createLaserScan({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				angleMin: message.angle_min, angleMax: message.angle_max,
				angleIncrement: message.angle_increment, timeIncrement: message.time_increment,
				scanTime: message.scan_time, rangeMin: message.range_min, rangeMax: message.range_max,
				ranges: Array.isArray(message.ranges) ? message.ranges : [],
				intensities: Array.isArray(message.intensities) ? message.intensities : [],
			});
		},
		toNative() { throw new TypeError("vizanti/LaserScan is read-only."); },
	}),
});

const temperatureMappings = Object.freeze({
	"sensor_msgs/msg/Temperature": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createTemperature({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				temperature: message.temperature,
				variance: message.variance,
			});
		},
		toNative() { throw new TypeError("vizanti/Temperature is read-only."); },
	}),
});

const twistMappings = Object.freeze({
	"geometry_msgs/msg/Twist": Object.freeze({
		fromNative(message) {
			return createTwist({ linear: message.linear, angular: message.angular });
		},
		toNative(message) {
			return { linear: message.linear, angular: message.angular };
		},
	}),
	"geometry_msgs/msg/TwistStamped": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const twist = message.twist || {};
			return createTwist({
				linear: twist.linear,
				angular: twist.angular,
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
			});
		},
		toNative(message) {
			return {
				header: { stamp: message.stamp || { sec: 0, nanosec: 0 }, frame_id: message.frameId },
				twist: { linear: message.linear, angular: message.angular },
			};
		},
	}),
});

const navSatFixMappings = Object.freeze({
	"sensor_msgs/msg/NavSatFix": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const status = message.status || {};
			return createNavSatFix({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				status: Number.isInteger(status.status) ? status.status : -1,
				service: Number.isInteger(status.service) ? status.service : 0,
				latitude: message.latitude,
				longitude: message.longitude,
				altitude: message.altitude,
				positionCovariance: Array.isArray(message.position_covariance) ? message.position_covariance : [],
				positionCovarianceType: Number.isInteger(message.position_covariance_type)
					? message.position_covariance_type : 0,
			});
		},
		toNative(message) {
			return {
				header: { stamp: message.stamp, frame_id: message.frameId },
				status: { status: message.status, service: message.service },
				latitude: message.latitude,
				longitude: message.longitude,
				altitude: message.altitude,
				position_covariance: message.positionCovariance,
				position_covariance_type: message.positionCovarianceType,
			};
		},
	}),
});

function poseArrayFromNative(message, poses) {
	const header = message.header || {};
	return createPoseArray({
		frameId: typeof header.frame_id === "string" ? header.frame_id : "",
		stamp: header.stamp || { sec: 0, nanosec: 0 },
		poses: Array.isArray(poses) ? poses.map((pose) => ({
			position: pose.position,
			orientation: pose.orientation,
		})) : [],
	});
}

const poseArrayMappings = Object.freeze({
	"geometry_msgs/msg/PoseArray": Object.freeze({
		fromNative(message) { return poseArrayFromNative(message, message.poses); },
		toNative() { throw new TypeError("vizanti/PoseArray is read-only."); },
	}),
	"nav2_msgs/msg/ParticleCloud": Object.freeze({
		fromNative(message) {
			const particles = Array.isArray(message.particles)
				? message.particles.map((particle) => particle.pose || {}) : [];
			return poseArrayFromNative(message, particles);
		},
		toNative() { throw new TypeError("vizanti/PoseArray is read-only."); },
	}),
});

const rangeMappings = Object.freeze({
	"sensor_msgs/msg/Range": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createRange({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				radiationType: message.radiation_type,
				fieldOfView: message.field_of_view,
				minRange: message.min_range,
				maxRange: message.max_range,
				range: message.range,
			});
		},
		toNative() {
			throw new TypeError("vizanti/Range is read-only.");
		},
	}),
});

const batteryStateMappings = Object.freeze({
	"sensor_msgs/msg/BatteryState": Object.freeze({
		fromNative(message) {
			return createBatteryState({
				percentage: message.percentage,
				voltage: message.voltage,
				current: message.current,
				charge: message.charge,
				capacity: message.capacity,
				cellVoltage: message.cell_voltage,
				powerSupplyStatus: message.power_supply_status,
				powerSupplyHealth: message.power_supply_health,
				powerSupplyTechnology: message.power_supply_technology,
			});
		},
		toNative() {
			throw new TypeError("vizanti/BatteryState is read-only.");
		},
	}),
});

const polygonMappings = Object.freeze({
	"geometry_msgs/msg/PolygonStamped": Object.freeze({
		fromNative(message) {
			return createPolygon({
				frameId: message.header.frame_id,
				stamp: message.header.stamp,
				points: message.polygon.points,
			});
		},
		toNative(message) {
			return {
				header: { stamp: message.stamp, frame_id: message.frameId },
				polygon: { points: message.points },
			};
		},
	}),
});

const COMPRESSION_TYPES = Object.freeze(["jpeg", "jpg", "png", "tiff", "webp", "rvl"]);

function compressedImageMetadata(format) {
	const lower = typeof format === "string" ? format.toLowerCase() : "";
	const encoding = lower.split(";")[0].trim();
	const compression = COMPRESSION_TYPES.find((type) => lower.includes(type)) || "unknown";
	const isDepth = lower.includes("compresseddepth") || encoding.startsWith("16uc1")
		|| encoding.startsWith("32fc1") || (encoding.startsWith("16uc") && lower.includes("depth"));
	const mimeType = compression === "png" ? "image/png"
		: compression === "webp" ? "image/webp"
		: compression === "tiff" ? "image/tiff" : "image/jpeg";
	return { encoding, compression, isDepth, mimeType };
}

function compressedImageData(data, mimeType) {
	const base64Data = typeof data === "string" ? data : binaryToBase64(data);
	if (mimeType !== "image/png") {
		return base64Data;
	}
	const pngIndex = base64Data.indexOf("iVBORw0KGgo");
	return pngIndex === -1 ? base64Data : base64Data.substring(pngIndex);
}

const imageMappings = Object.freeze({
	"sensor_msgs/msg/CompressedImage": Object.freeze({
		fromNative(message) {
			const metadata = compressedImageMetadata(message.format);
			return createImage({
				...metadata,
				base64Data: compressedImageData(message.data, metadata.mimeType),
				frameId: message.header && typeof message.header.frame_id === "string"
					? message.header.frame_id : "",
			});
		},
		toNative() {
			throw new TypeError("vizanti/Image is read-only.");
		},
	}),
});

function markerFromNative(marker) {
	const header = marker.header || {};
	const pose = marker.pose || {};
	return {
		frameId: typeof header.frame_id === "string" ? header.frame_id : "",
		frameStamp: header.stamp || { sec: 0, nanosec: 0 },
		namespace: typeof marker.ns === "string" ? marker.ns : "",
		id: marker.id,
		type: marker.type,
		action: marker.action,
		position: pose.position || { x: 0, y: 0, z: 0 },
		orientation: pose.orientation || { x: 0, y: 0, z: 0, w: 1 },
		scale: marker.scale || { x: 1, y: 1, z: 1 },
		color: marker.color,
		lifetime: marker.lifetime || { sec: 0, nanosec: 0 },
		points: Array.isArray(marker.points) ? marker.points : [],
		colors: Array.isArray(marker.colors) ? marker.colors : [],
		text: typeof marker.text === "string" ? marker.text : "",
	};
}

const markerArrayMappings = Object.freeze({
	"visualization_msgs/msg/MarkerArray": Object.freeze({
		fromNative(message) {
			const markers = Array.isArray(message.markers) ? message.markers.map(markerFromNative) : [];
			return createMarkerArray(markers);
		},
		toNative() {
			throw new TypeError("vizanti/MarkerArray is read-only.");
		},
	}),
});

const gridCellsMappings = Object.freeze({
	"nav_msgs/msg/GridCells": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createGridCells({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				cellWidth: message.cell_width,
				cellHeight: message.cell_height,
				cells: Array.isArray(message.cells) ? message.cells : [],
			});
		},
		toNative() {
			throw new TypeError("vizanti/GridCells is read-only.");
		},
	}),
});

const occupancyGridMappings = Object.freeze({
	"nav_msgs/msg/OccupancyGrid": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			const info = message.info || {};
			const origin = info.origin || {};
			return createOccupancyGrid({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				resolution: info.resolution,
				width: info.width,
				height: info.height,
				originPosition: origin.position,
				originOrientation: origin.orientation,
				data: message.data,
			});
		},
		toNative() {
			throw new TypeError("vizanti/OccupancyGrid is read-only.");
		},
	}),
});

const imuMappings = Object.freeze({
	"sensor_msgs/msg/Imu": Object.freeze({
		fromNative(message) {
			const header = message.header || {};
			return createImu({
				frameId: typeof header.frame_id === "string" ? header.frame_id : "",
				stamp: header.stamp || { sec: 0, nanosec: 0 },
				orientation: message.orientation,
				angularVelocity: message.angular_velocity,
				linearAcceleration: message.linear_acceleration,
			});
		},
		toNative() {
			throw new TypeError("vizanti/Imu is read-only.");
		},
	}),
});

function mappingsFor(guiMessageType) {
	if (guiMessageType === GUI_MESSAGE_TYPE.FLOAT) return floatMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.BOOL) return boolMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.EMPTY) return emptyMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POSE) return poseMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POSE_STAMPED) return poseStampedMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POSE_WITH_COVARIANCE) return poseWithCovarianceMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.ODOMETRY) return odometryMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.PATH) return pathMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POSE_ARRAY) return poseArrayMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.RANGE) return rangeMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POINT_CLOUD) return pointCloudMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.LASER_SCAN) return laserScanMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.TEMPERATURE) return temperatureMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.TWIST) return twistMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.NAV_SAT_FIX) return navSatFixMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.BATTERY_STATE) return batteryStateMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POLYGON) return polygonMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.IMAGE) return imageMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.MARKER_ARRAY) return markerArrayMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.GRID_CELLS) return gridCellsMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.OCCUPANCY_GRID) return occupancyGridMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.IMU) return imuMappings;
	return null;
}

function serviceTypeFor(guiMessageType) {
	if (guiMessageType === GUI_MESSAGE_TYPE.BOOL) return "std_srvs/srv/SetBool";
	if (guiMessageType === GUI_MESSAGE_TYPE.EMPTY) return "std_srvs/srv/Empty";
	if (guiMessageType === GUI_MESSAGE_TYPE.TRIGGER) return "std_srvs/srv/Trigger";
	return "";
}

function nativeServiceRequest(request) {
	if (!request || typeof request !== "object") {
		throw new TypeError("ROS2 services require a request message.");
	}
	if (request.type === GUI_MESSAGE_TYPE.BOOL) return { data: request.value };
	if (request.type === GUI_MESSAGE_TYPE.EMPTY || request.type === GUI_MESSAGE_TYPE.TRIGGER) return {};
	return request;
}

function normalizedNamespace(configuration) {
	const namespace = configuration && typeof configuration.namespace === "string"
		? configuration.namespace.trim().replace(/\/+$/g, "") : "";
	if (!namespace || namespace === "/") return "";
	return namespace.startsWith("/") ? namespace : `/${namespace}`;
}

function belongsToNamespace(topic, configuration) {
	const namespace = normalizedNamespace(configuration);
	return namespace === "" || topic === namespace || topic.startsWith(`${namespace}/`);
}

function resolveEndpointAddress(address, configuration) {
	const endpoint = typeof address === "string" ? address.trim() : "";
	if (endpoint === "") return "";
	if (endpoint.startsWith("/")) return endpoint;
	const namespace = normalizedNamespace(configuration);
	return namespace === "" ? `/${endpoint}` : `${namespace}/${endpoint}`;
}

function requireEndpointString(endpoint, field) {
	if (!endpoint || typeof endpoint[field] !== "string" || endpoint[field].trim() === "") {
		throw new TypeError(`ROS2 endpoint.${field} must be a non-empty string.`);
	}

	return endpoint[field];
}

function createTopicOptions(client, endpoint) {
	const options = {
		ros: client.ros,
		name: requireEndpointString(endpoint, "topic"),
		messageType: requireEndpointString(endpoint, "messageType"),
	};

	if (typeof client.compression === "string" && client.compression !== "none") {
		options.compression = client.compression;
	}
	if (endpoint.compression !== undefined) {
		options.compression = endpoint.compression;
	}
	if (endpoint.throttleRate !== undefined) {
		options.throttle_rate = endpoint.throttleRate;
	}
	if (endpoint.queueLength !== undefined) {
		options.queue_length = endpoint.queueLength;
	}

	return options;
}

function applyDeliveryOptions(options, deliveryOptions) {
	if (!deliveryOptions || typeof deliveryOptions !== "object") {
		throw new TypeError("ROS2 delivery options must be an object.");
	}
	if (deliveryOptions.throttleRate !== undefined) {
		if (!Number.isInteger(deliveryOptions.throttleRate) || deliveryOptions.throttleRate < 0) {
			throw new TypeError("ROS2 throttleRate must be a non-negative integer.");
		}
		options.throttle_rate = deliveryOptions.throttleRate;
	}
	if (deliveryOptions.queueLength !== undefined) {
		if (!Number.isInteger(deliveryOptions.queueLength) || deliveryOptions.queueLength < 1) {
			throw new TypeError("ROS2 queueLength must be a positive integer.");
		}
		options.queue_length = deliveryOptions.queueLength;
	}
	return options;
}

function createServiceOptions(client, endpoint) {
	return {
		ros: client.ros,
		name: requireEndpointString(endpoint, "service"),
		serviceType: requireEndpointString(endpoint, "serviceType"),
	};
}

function callService(client, service, serviceType, request, roslib) {
	const clientService = new roslib.Service({
		ros: client.ros,
		name: service,
		serviceType,
	});
	return new Promise((resolve, reject) => {
		clientService.callService(new roslib.ServiceRequest(request), resolve, reject);
	});
}

// The current dashboard has one ROS2 adapter.
export const localRos2Instance = Object.freeze({
	id: "ros2",
});

export function createRos2Adapter({ ROSLIB: roslib, getClient, createTf }) {
	if (!roslib || typeof roslib.Topic !== "function" || typeof roslib.Service !== "function") {
		throw new TypeError("ROS2 adapter requires ROSLIB Topic and Service constructors.");
	}
	if (typeof getClient !== "function") {
		throw new TypeError("ROS2 adapter requires a client resolver.");
	}
	if (typeof createTf !== "function") {
		throw new TypeError("ROS2 adapter requires a TF service factory.");
	}
	let tf = null;

	return assertAdapterContract({
		id: "ros2",
		configurationFields() {
			return [
				{
					id: "namespace",
					label: "Namespace",
					type: "text",
					placeholder: "/robot_1",
					defaultValue: "",
				},
				{
					id: "tfFrame",
					label: "TF frame",
					type: "text",
					placeholder: "base_link",
					defaultValue: "base_link",
				},
			];
		},
		supports(guiMessageType) {
			return mappingsFor(guiMessageType) !== null;
		},

		endpointFields(endpointType, guiMessageType) {
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				const serviceType = serviceTypeFor(guiMessageType);
				return [
					...(serviceType === "" ? [
						{ id: "serviceType", label: "Service Type", control: "text", placeholder: "package_name/srv/Service" },
					] : []),
					{
						id: "endpointId", label: "Service", control: "endpoint",
						manual: { label: "Enter manually", placeholder: "Service name" },
					},
				];
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC || !this.supports(guiMessageType)) {
				return [];
			}

			return [
				{ id: "outputMessageId", label: "Message", control: "message" },
				{
					id: "endpointId", label: "Topic", control: "endpoint",
					manual: { label: "Enter manually", placeholder: "Topic name" },
				},
			];
		},

		allowsDiscovery(endpointType, guiMessageType) {
			return endpointType === ENDPOINT_TYPE.SERVICE
				|| (endpointType === ENDPOINT_TYPE.TOPIC
					&& (guiMessageType === undefined || this.supports(guiMessageType)));
		},

		getTf(instance) {
			if (!tf) {
				const client = getClient(instance);
				tf = createTf({ ROSLIB: roslib, ros: client.ros, compression: client.compression });
			}
			return tf;
		},

		listOutputMessages(guiMessageType) {
			const mappings = mappingsFor(guiMessageType);
			return mappings ? Object.keys(mappings).map((id) => ({ id, label: id })) : [];
		},

		async discoverEndpoints(instance, configuration, endpointType, guiMessageType, outputMessageId, endpointValues) {
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				const serviceType = serviceTypeFor(guiMessageType) || (endpointValues && typeof endpointValues.serviceType === "string"
					? endpointValues.serviceType.trim() : "");
				if (serviceType === "") return [];
				const services = await getClient(instance).get_services(serviceType);
				return services.filter((service) => belongsToNamespace(service, configuration)).map((service) => ({
					id: service,
					label: service,
					endpoint: { service, serviceType },
				}));
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC) return [];
			const result = await getClient(instance).get_all_topics();
			if (guiMessageType === undefined) {
				return result.topics.map((topic, index) => ({
					id: topic,
					label: topic,
					messageType: result.types[index] || "",
				})).filter((topic) => topic.id !== "/vizanti/tf_consolidated");
			}
			const mappings = mappingsFor(guiMessageType);
			if (!mappings || !mappings[outputMessageId]) return [];
			return result.topics.map((topic, index) => ({
				id: topic,
				label: `${topic} (${result.types[index]})`,
				endpoint: { topic, nativeMessageType: result.types[index] },
			})).filter((endpoint) => endpoint.endpoint.nativeMessageType === outputMessageId)
				.filter((endpoint) => belongsToNamespace(endpoint.id, configuration));
		},

		createManualEndpoint(instance, configuration, endpointType, guiMessageType, outputMessageId, address, endpointValues) {
			const endpointId = typeof address === "string" ? address.trim() : "";
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				const serviceType = serviceTypeFor(guiMessageType) || (endpointValues && typeof endpointValues.serviceType === "string"
					? endpointValues.serviceType.trim() : "");
				if (endpointId === "" || serviceType === "") return null;
				return {
					id: endpointId,
					label: endpointId,
					endpoint: { service: resolveEndpointAddress(endpointId, configuration), serviceType },
				};
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC) return null;
			const mappings = mappingsFor(guiMessageType);
			if (!mappings || !mappings[outputMessageId] || endpointId === "") {
				return null;
			}
			return {
				id: endpointId,
				label: endpointId,
				endpoint: {
					topic: resolveEndpointAddress(endpointId, configuration),
					nativeMessageType: outputMessageId,
				},
			};
		},

		async restoreEndpoint(instance, configuration, endpointType, guiMessageType, outputMessageId, endpointId, endpointValues) {
			if (typeof endpointId !== "string" || endpointId === "") {
				return null;
			}
			const endpoints = await this.discoverEndpoints(
				instance, configuration, endpointType, guiMessageType, outputMessageId, endpointValues,
			);
			return endpoints.find((endpoint) => endpoint.id === endpointId) || null;
		},

		subscribe(instance, configuration, endpoint, guiMessageType, outputMessageId, onMessage, deliveryOptions = {}) {
			const mappings = mappingsFor(guiMessageType);
			const mapping = mappings && mappings[outputMessageId];
			if (!this.supports(guiMessageType) || !mapping || typeof onMessage !== "function") {
				throw new TypeError("ROS2 subscriptions require a message callback.");
			}

			const topic = new roslib.Topic(applyDeliveryOptions(createTopicOptions(getClient(instance), {
				topic: endpoint.topic,
				messageType: endpoint.nativeMessageType,
			}), deliveryOptions));
			const onNativeMessage = (message) => onMessage(mapping.fromNative(message));
			topic.subscribe(onNativeMessage);
			return Object.freeze({
				unsubscribe() {
					topic.unsubscribe(onNativeMessage);
				},
			});
		},

		subscribeRaw(instance, configuration, endpoint, onMessage, deliveryOptions = {}) {
			if (typeof onMessage !== "function") {
				throw new TypeError("ROS2 raw subscriptions require a message callback.");
			}
			const topic = new roslib.Topic(applyDeliveryOptions(createTopicOptions(getClient(instance), {
				topic: endpoint.topic,
				messageType: endpoint.nativeMessageType,
			}), deliveryOptions));
			topic.subscribe(onMessage);
			return Object.freeze({
				unsubscribe() {
					topic.unsubscribe(onMessage);
				},
			});
		},

		getTopicInfo(instance, configuration, endpoint) {
			return getClient(instance).get_topic_publishers_and_subscribers(endpoint.topic);
		},

		publish(instance, configuration, endpoint, outputMessageId, message) {
			const mappings = mappingsFor(message && message.type);
			const mapping = mappings && mappings[outputMessageId];
			if (!mapping) {
				throw new TypeError("ROS2 endpoint does not support this GUI message type.");
			}
			const topic = new roslib.Topic(createTopicOptions(getClient(instance), {
				topic: endpoint.topic,
				messageType: endpoint.nativeMessageType,
			}));
			topic.publish(new roslib.Message(mapping.toNative(message)));
			topic.unadvertise();
		},

		call(instance, configuration, endpoint, request) {
			const service = new roslib.Service(createServiceOptions(getClient(instance), endpoint));
			return new Promise((resolve, reject) => {
				service.callService(new roslib.ServiceRequest(nativeServiceRequest(request)), resolve, reject);
			});
		},

		async listNodes(instance, configuration) {
			const client = getClient(instance);
			const result = await client.get_all_nodes();
			return Array.isArray(result.nodes)
				? result.nodes.filter((node) => typeof node === "string" && !node.includes("vizanti")) : [];
		},

		async getNodeParameters(instance, configuration, node) {
			if (typeof node !== "string" || node === "") {
				throw new TypeError("ROS2 parameter lookup requires a node name.");
			}
			const response = await serverApi.getNodeParameters(node);
			const parameters = response.parameters;
			if (!Array.isArray(parameters)) {
				throw new TypeError("ROS2 parameter API returned an invalid parameter list.");
			}
			return parameters;
		},

		async setNodeParameter(instance, configuration, node, name, value) {
			if (typeof node !== "string" || node === "" || typeof name !== "string" || name === "") {
				throw new TypeError("ROS2 parameter updates require a node and parameter name.");
			}
			return serverApi.setNodeParameter(node, name, value);
		},

		async recordingStatus(instance, configuration) {
			const response = await serverApi.recordingStatus();
			return {
				active: response.active === true,
				message: typeof response.message === "string" ? response.message : "",
			};
		},

		async setRecording(instance, configuration, request) {
			if (!request || typeof request !== "object" || typeof request.start !== "boolean"
				|| typeof request.path !== "string" || !Array.isArray(request.topics)
				|| !request.topics.every((topic) => typeof topic === "string")) {
				throw new TypeError("ROS2 recording requires a start flag, path, and topic names.");
			}
			const response = await serverApi.setRecording(request);
			return {
				success: response.success === true,
				message: typeof response.message === "string" ? response.message : "",
			};
		},

		commandShortcuts(instance, configuration) {
			return [
				{ id: "ros2-run", label: "ros2 run", command: "ros2 run ", background: true },
				{ id: "ros2-launch", label: "ros2 launch", command: "ros2 launch ", background: true },
				{ id: "ros2-doctor", label: "ros2 doctor", command: "ros2 doctor --report" },
			];
		},
	});
}

export const ros2Adapter = createRos2Adapter({
	ROSLIB,
	createTf: createRosTf,
	getClient(instance) {
		if (!instance || instance.id !== localRos2Instance.id) {
			throw new TypeError("Unknown ROS2 adapter instance.");
		}
		return rosbridge;
	},
});
