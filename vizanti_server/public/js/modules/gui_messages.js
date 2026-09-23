// Stable message contracts exchanged between plugins and adapters. Native
// protocol message types must not be exposed to plugins.

export const GUI_MESSAGE_TYPE = Object.freeze({
	FLOAT: "vizanti/Float",
	INT64: "vizanti/Int64",
	INT32: "vizanti/Int32",
	BOOL: "vizanti/Bool",
	POSE: "vizanti/Pose",
	POSE_STAMPED: "vizanti/PoseStamped",
	POSE_WITH_COVARIANCE: "vizanti/PoseWithCovariance",
	IMAGE: "vizanti/Image",
	PATH: "vizanti/Path",
	ODOMETRY: "vizanti/Odometry",
	POSE_ARRAY: "vizanti/PoseArray",
	RANGE: "vizanti/Range",
	POINT_CLOUD: "vizanti/PointCloud",
	LASER_SCAN: "vizanti/LaserScan",
	TEMPERATURE: "vizanti/Temperature",
	TWIST: "vizanti/Twist",
	NAV_SAT_FIX: "vizanti/NavSatFix",
	BATTERY_STATE: "vizanti/BatteryState",
	POLYGON: "vizanti/Polygon",
	MARKER_ARRAY: "vizanti/MarkerArray",
	GRID_CELLS: "vizanti/GridCells",
	OCCUPANCY_GRID: "vizanti/OccupancyGrid",
	EMPTY: "vizanti/Empty",
	TRIGGER: "vizanti/Trigger",
	IMU: "vizanti/Imu",
});

export function createFloat(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError("vizanti/Float requires a finite numeric value.");
	}
	return Object.freeze({ type: GUI_MESSAGE_TYPE.FLOAT, value });
}

export function createBool(value) {
	if (typeof value !== "boolean") {
		throw new TypeError("vizanti/Bool requires a boolean value.");
	}
	return Object.freeze({ type: GUI_MESSAGE_TYPE.BOOL, value });
}

export function createEmpty() {
	return Object.freeze({ type: GUI_MESSAGE_TYPE.EMPTY });
}

export function createTrigger() {
	return Object.freeze({ type: GUI_MESSAGE_TYPE.TRIGGER });
}

export function createPose({ frameId, position, orientation, stamp }) {
	if (typeof frameId !== "string" || !position || !orientation || !stamp) {
		throw new TypeError("vizanti/Pose requires frame, position, orientation, and timestamp.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POSE,
		frameId,
		position: Object.freeze({ ...position }),
		orientation: Object.freeze({ ...orientation }),
		stamp: Object.freeze({ ...stamp }),
	});
}

export function createPoseStamped({ frameId, position, orientation, stamp }) {
	if (typeof frameId !== "string" || !position || !orientation || !stamp) {
		throw new TypeError("vizanti/PoseStamped requires frame, position, orientation, and timestamp.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POSE_STAMPED,
		frameId,
		position: Object.freeze({ ...position }),
		orientation: Object.freeze({ ...orientation }),
		stamp: Object.freeze({ ...stamp }),
	});
}

export function createPoseWithCovariance({ frameId, position, orientation, stamp, covariance }) {
	if (typeof frameId !== "string" || !position || !orientation || !stamp
		|| !Array.isArray(covariance) || covariance.length !== 36) {
		throw new TypeError("vizanti/PoseWithCovariance requires frame, pose, timestamp, and 36 covariance values.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POSE_WITH_COVARIANCE,
		frameId,
		position: Object.freeze({ ...position }),
		orientation: Object.freeze({ ...orientation }),
		stamp: Object.freeze({ ...stamp }),
		covariance: Object.freeze([...covariance]),
	});
}

function validPose(value) {
	return value && typeof value.frameId === "string" && value.stamp
		&& value.position && value.orientation;
}

export function createOdometry({ frameId, stamp, position, orientation, childFrameId = "" }) {
	if (!validPose({ frameId, stamp, position, orientation }) || typeof childFrameId !== "string") {
		throw new TypeError("vizanti/Odometry requires a frame, timestamp, pose, and child frame.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.ODOMETRY,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		position: Object.freeze({ ...position }),
		orientation: Object.freeze({ ...orientation }),
		childFrameId,
	});
}

export function createPath({ frameId, stamp, poses }) {
	if (typeof frameId !== "string" || !stamp || !Array.isArray(poses) || !poses.every(validPose)) {
		throw new TypeError("vizanti/Path requires a frame, timestamp, and valid poses.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.PATH,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		poses: Object.freeze(poses.map((pose) => Object.freeze({
			frameId: pose.frameId,
			stamp: Object.freeze({ ...pose.stamp }),
			position: Object.freeze({ ...pose.position }),
			orientation: Object.freeze({ ...pose.orientation }),
		}))),
	});
}

export function createPoseArray({ frameId, stamp, poses }) {
	if (typeof frameId !== "string" || !stamp || !Array.isArray(poses)
		|| !poses.every((pose) => pose && pose.position && pose.orientation)) {
		throw new TypeError("vizanti/PoseArray requires a frame, timestamp, and poses.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POSE_ARRAY,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		poses: Object.freeze(poses.map((pose) => Object.freeze({
			position: Object.freeze({ ...pose.position }),
			orientation: Object.freeze({ ...pose.orientation }),
		}))),
	});
}

export function createRange({ frameId, stamp, radiationType, fieldOfView, minRange, maxRange, range }) {
	if (typeof frameId !== "string" || !stamp || !Number.isInteger(radiationType)
		|| ![fieldOfView, minRange, maxRange, range].every(Number.isFinite)) {
		throw new TypeError("vizanti/Range requires a frame, timestamp, type, and finite measurements.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.RANGE,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		radiationType,
		fieldOfView,
		minRange,
		maxRange,
		range,
	});
}

export function createPointCloud({
	frameId, stamp, width, height, fields, isBigEndian, pointStep, rowStep, data, isDense,
}) {
	if (typeof frameId !== "string" || !stamp || !Number.isInteger(width) || width < 0
		|| !Number.isInteger(height) || height < 0 || !Array.isArray(fields)
		|| typeof isBigEndian !== "boolean" || !Number.isInteger(pointStep) || pointStep < 0
		|| !Number.isInteger(rowStep) || rowStep < 0 || !data || typeof isDense !== "boolean") {
		throw new TypeError("vizanti/PointCloud requires a header, layout, and binary point data.");
	}
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POINT_CLOUD,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		width,
		height,
		fields: Object.freeze(fields.map((field) => Object.freeze({ ...field }))),
		isBigEndian,
		pointStep,
		rowStep,
		data: Object.freeze([...bytes]),
		isDense,
	});
}

export function createLaserScan({
	frameId, stamp, angleMin, angleMax, angleIncrement, timeIncrement, scanTime, rangeMin, rangeMax, ranges, intensities,
}) {
	if (typeof frameId !== "string" || !stamp
		|| ![angleMin, angleMax, angleIncrement, timeIncrement, scanTime, rangeMin, rangeMax].every(Number.isFinite)
		|| !Array.isArray(ranges) || !Array.isArray(intensities)) {
		throw new TypeError("vizanti/LaserScan requires a header, scan geometry, and range arrays.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.LASER_SCAN,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		angleMin, angleMax, angleIncrement, timeIncrement, scanTime, rangeMin, rangeMax,
		ranges: Object.freeze([...ranges]), intensities: Object.freeze([...intensities]),
	});
}

export function createTemperature({ frameId, stamp, temperature, variance }) {
	if (typeof frameId !== "string" || !stamp || !Number.isFinite(temperature) || !Number.isFinite(variance)) {
		throw new TypeError("vizanti/Temperature requires a header and finite measurements.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.TEMPERATURE,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		temperature,
		variance,
	});
}

export function createTwist({ linear, angular, frameId = "", stamp = null }) {
	if (!linear || !angular || typeof frameId !== "string" || (stamp !== null && typeof stamp !== "object")) {
		throw new TypeError("vizanti/Twist requires linear and angular vectors.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.TWIST,
		linear: Object.freeze({ ...linear }),
		angular: Object.freeze({ ...angular }),
		frameId,
		stamp: stamp === null ? null : Object.freeze({ ...stamp }),
	});
}

export function createNavSatFix({
	frameId, stamp, status, service, latitude, longitude, altitude,
	positionCovariance, positionCovarianceType,
}) {
	const validMeasurement = (value) => typeof value === "number"
		&& (Number.isFinite(value) || Number.isNaN(value));
	if (typeof frameId !== "string" || !stamp || !Number.isInteger(status)
		|| !Number.isInteger(service) || ![latitude, longitude, altitude].every(validMeasurement)
		|| !Array.isArray(positionCovariance) || positionCovariance.length !== 9
		|| !positionCovariance.every(validMeasurement) || !Number.isInteger(positionCovarianceType)) {
		throw new TypeError("vizanti/NavSatFix requires a header, status, coordinates, and 3x3 covariance.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.NAV_SAT_FIX,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		status,
		service,
		latitude,
		longitude,
		altitude,
		positionCovariance: Object.freeze([...positionCovariance]),
		positionCovarianceType,
	});
}

export function createBatteryState({
	percentage,
	voltage,
	current,
	charge,
	capacity,
	cellVoltage = [],
	powerSupplyStatus,
	powerSupplyHealth,
	powerSupplyTechnology,
}) {
	if (!Array.isArray(cellVoltage)) {
		throw new TypeError("vizanti/BatteryState requires cellVoltage to be an array.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.BATTERY_STATE,
		percentage,
		voltage,
		current,
		charge,
		capacity,
		cellVoltage: Object.freeze([...cellVoltage]),
		powerSupplyStatus,
		powerSupplyHealth,
		powerSupplyTechnology,
	});
}

export function createPolygon({ frameId, stamp, points }) {
	if (typeof frameId !== "string" || !stamp || !Array.isArray(points) || points.length < 3) {
		throw new TypeError("vizanti/Polygon requires a frame, timestamp, and at least three points.");
	}
	if (!points.every((point) => point
		&& Number.isFinite(point.x)
		&& Number.isFinite(point.y)
		&& Number.isFinite(point.z))) {
		throw new TypeError("vizanti/Polygon points require finite x, y, and z coordinates.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POLYGON,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		points: Object.freeze(points.map((point) => Object.freeze({
			x: point.x,
			y: point.y,
			z: point.z,
		}))),
	});
}

export function createImage({
	mimeType,
	base64Data,
	frameId = "",
	encoding = "",
	compression = "unknown",
	isDepth = false,
}) {
	if (typeof mimeType !== "string" || mimeType === "" || typeof base64Data !== "string") {
		throw new TypeError("vizanti/Image requires a MIME type and base64 image data.");
	}
	if (typeof frameId !== "string" || typeof encoding !== "string"
		|| typeof compression !== "string" || typeof isDepth !== "boolean") {
		throw new TypeError("vizanti/Image metadata has invalid field types.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.IMAGE,
		mimeType,
		base64Data,
		frameId,
		encoding,
		compression,
		isDepth,
	});
}

// Marker entries remain mutable because renderers cache derived transforms and
// drawing primitives on them. Their adapter-defined wire representation is
// converted to this stable schema before it reaches a plugin.
export function createMarkerArray(markers) {
	if (!Array.isArray(markers) || !markers.every((marker) => marker && typeof marker === "object")) {
		throw new TypeError("vizanti/MarkerArray requires an array of marker objects.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.MARKER_ARRAY,
		markers: Object.freeze([...markers]),
	});
}

export function createGridCells({ frameId, stamp, cellWidth, cellHeight, cells }) {
	if (typeof frameId !== "string" || !stamp || !Number.isFinite(cellWidth)
		|| !Number.isFinite(cellHeight) || !Array.isArray(cells)) {
		throw new TypeError("vizanti/GridCells requires a frame, timestamp, finite cell dimensions, and cells.");
	}
	if (!cells.every((cell) => cell && Number.isFinite(cell.x)
		&& Number.isFinite(cell.y) && Number.isFinite(cell.z))) {
		throw new TypeError("vizanti/GridCells cells require finite x, y, and z coordinates.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.GRID_CELLS,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		cellWidth,
		cellHeight,
		cells: Object.freeze(cells.map((cell) => Object.freeze({
			x: cell.x,
			y: cell.y,
			z: cell.z,
		}))),
	});
}

export function createOccupancyGrid({
	frameId,
	stamp,
	resolution,
	width,
	height,
	originPosition,
	originOrientation,
	data,
}) {
	const isPosition = (value) => value && Number.isFinite(value.x)
		&& Number.isFinite(value.y) && Number.isFinite(value.z);
	const isOrientation = (value) => value && Number.isFinite(value.x)
		&& Number.isFinite(value.y) && Number.isFinite(value.z) && Number.isFinite(value.w);
	const expectedDataLength = width * height;
	if (typeof frameId !== "string" || !stamp || !Number.isFinite(resolution) || resolution <= 0
		|| !Number.isInteger(width) || width < 0 || !Number.isInteger(height) || height < 0
		|| !Number.isSafeInteger(expectedDataLength) || !isPosition(originPosition)
		|| !isOrientation(originOrientation) || !data || typeof data.length !== "number"
		|| data.length !== expectedDataLength) {
		throw new TypeError("vizanti/OccupancyGrid requires a frame, timestamp, positive resolution, dimensions, origin, and data.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.OCCUPANCY_GRID,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		resolution,
		width,
		height,
		originPosition: Object.freeze({ ...originPosition }),
		originOrientation: Object.freeze({ ...originOrientation }),
		// A typed array avoids a costly object-per-cell representation. Consumers
		// treat it as read-only while passing it to render workers.
		data: Int8Array.from(data),
	});
}

export function createImu({ frameId, stamp, orientation, angularVelocity, linearAcceleration }) {
	const isVector = (value) => value && Number.isFinite(value.x)
		&& Number.isFinite(value.y) && Number.isFinite(value.z);
	if (typeof frameId !== "string" || !stamp || !orientation || !isVector(angularVelocity)
		|| !isVector(linearAcceleration) || !Number.isFinite(orientation.x)
		|| !Number.isFinite(orientation.y) || !Number.isFinite(orientation.z)
		|| !Number.isFinite(orientation.w)) {
		throw new TypeError("vizanti/Imu requires a frame, timestamp, orientation, angular velocity, and linear acceleration.");
	}

	return Object.freeze({
		type: GUI_MESSAGE_TYPE.IMU,
		frameId,
		stamp: Object.freeze({ ...stamp }),
		orientation: Object.freeze({ ...orientation }),
		angularVelocity: Object.freeze({ ...angularVelocity }),
		linearAcceleration: Object.freeze({ ...linearAcceleration }),
	});
}
