import assert from 'assert';
import { GUI_MESSAGE_TYPE, createBatteryState, createBool, createEmpty, createFloat, createGridCells, createImage, createImu, createMarkerArray, createOdometry, createOccupancyGrid, createPath, createPolygon, createPoseArray, createPoseWithCovariance, createRange, createTrigger } from '../../public/js/modules/gui_messages.js';

describe('GUI messages', function () {
	it('creates an immutable Float message', function () {
		const message = createFloat(2.5);
		assert.deepEqual(message, { type: GUI_MESSAGE_TYPE.FLOAT, value: 2.5 });
		assert.throws(() => { message.value = 3; }, TypeError);
	});

	it('declares the GUI value and data message types', function () {
		assert.equal(GUI_MESSAGE_TYPE.BOOL, 'vizanti/Bool');
		assert.equal(GUI_MESSAGE_TYPE.EMPTY, 'vizanti/Empty');
		assert.equal(GUI_MESSAGE_TYPE.TRIGGER, 'vizanti/Trigger');
		assert.equal(GUI_MESSAGE_TYPE.IMU, 'vizanti/Imu');
		assert.equal(GUI_MESSAGE_TYPE.IMAGE, 'vizanti/Image');
		assert.equal(GUI_MESSAGE_TYPE.PATH, 'vizanti/Path');
		assert.throws(() => createFloat(NaN), TypeError);
	});

	it('creates immutable Bool, Empty, and Trigger message requests', function () {
		assert.deepEqual(createBool(true), { type: GUI_MESSAGE_TYPE.BOOL, value: true });
		assert.deepEqual(createEmpty(), { type: GUI_MESSAGE_TYPE.EMPTY });
		assert.deepEqual(createTrigger(), { type: GUI_MESSAGE_TYPE.TRIGGER });
		assert.throws(() => createBool(1), TypeError);
	});

	it('creates an immutable BatteryState message with canonical fields', function () {
		const message = createBatteryState({
			percentage: 0.5,
			voltage: 12.3,
			current: 1.2,
			charge: 2,
			capacity: 4,
			cellVoltage: [3.1, 3.2],
			powerSupplyStatus: 2,
			powerSupplyHealth: 1,
			powerSupplyTechnology: 3,
		});
		assert.deepEqual(message, {
			type: GUI_MESSAGE_TYPE.BATTERY_STATE,
			percentage: 0.5,
			voltage: 12.3,
			current: 1.2,
			charge: 2,
			capacity: 4,
			cellVoltage: [3.1, 3.2],
			powerSupplyStatus: 2,
			powerSupplyHealth: 1,
			powerSupplyTechnology: 3,
		});
		assert.throws(() => message.cellVoltage.push(3.3), TypeError);
	});

	it('creates an immutable Polygon message with canonical points', function () {
		const message = createPolygon({
			frameId: 'map',
			stamp: { sec: 1, nanosec: 2 },
			points: [
				{ x: 1, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }, { x: 3, y: 4, z: 0 },
			],
		});
		assert.deepEqual(message, {
			type: GUI_MESSAGE_TYPE.POLYGON,
			frameId: 'map', stamp: { sec: 1, nanosec: 2 },
			points: [{ x: 1, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }, { x: 3, y: 4, z: 0 }],
		});
		assert.throws(() => message.points.push({ x: 0, y: 0, z: 0 }), TypeError);
		assert.throws(() => createPolygon({ frameId: 'map', stamp: {}, points: [{ x: 0, y: 0, z: 0 }] }), TypeError);
	});

	it('creates an immutable encoded Image message', function () {
		const message = createImage({
			mimeType: 'image/png', base64Data: 'iVBORw0KGgo', frameId: 'camera',
			encoding: '16uc1', compression: 'png', isDepth: true,
		});
		assert.deepEqual(message, {
			type: GUI_MESSAGE_TYPE.IMAGE,
			mimeType: 'image/png', base64Data: 'iVBORw0KGgo', frameId: 'camera',
			encoding: '16uc1', compression: 'png', isDepth: true,
		});
		assert.throws(() => { message.mimeType = 'image/jpeg'; }, TypeError);
	});

	it('creates an immutable PoseWithCovariance message', function () {
		const message = createPoseWithCovariance({
			frameId: 'map', stamp: { sec: 1, nanosec: 2 },
			position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 },
			covariance: Array(36).fill(0),
		});
		assert.equal(message.type, GUI_MESSAGE_TYPE.POSE_WITH_COVARIANCE);
		assert.equal(message.covariance.length, 36);
		assert.throws(() => message.covariance.push(1), TypeError);
		assert.throws(() => createPoseWithCovariance({
			frameId: 'map', stamp: {}, position: {}, orientation: {}, covariance: [],
		}), TypeError);
	});

	it('creates immutable navigation and range messages', function () {
		const pose = { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
		const stamp = { sec: 1, nanosec: 2 };
		const odometry = createOdometry({ frameId: 'map', stamp, ...pose, childFrameId: 'base_link' });
		const path = createPath({ frameId: 'map', stamp, poses: [{ frameId: 'map', stamp, ...pose }] });
		const poseArray = createPoseArray({ frameId: 'map', stamp, poses: [pose] });
		const range = createRange({ frameId: 'sensor', stamp, radiationType: 0, fieldOfView: 1, minRange: 0.1, maxRange: 4, range: 2 });
		assert.equal(odometry.type, GUI_MESSAGE_TYPE.ODOMETRY);
		assert.equal(path.poses[0].position.x, 1);
		assert.throws(() => path.poses.push({}), TypeError);
		assert.equal(poseArray.type, GUI_MESSAGE_TYPE.POSE_ARRAY);
		assert.equal(range.type, GUI_MESSAGE_TYPE.RANGE);
		assert.throws(() => createRange({ frameId: 'sensor', stamp, radiationType: 0, fieldOfView: 1, minRange: 0, maxRange: 1, range: NaN }), TypeError);
	});

	it('wraps marker arrays without freezing renderer-owned marker state', function () {
		const marker = { namespace: 'path', id: 4 };
		const message = createMarkerArray([marker]);
		assert.equal(message.type, GUI_MESSAGE_TYPE.MARKER_ARRAY);
		assert.throws(() => message.markers.push({}), TypeError);
		marker.transformed = { translation: { x: 1, y: 2, z: 0 } };
		assert.equal(message.markers[0].transformed.translation.x, 1);
	});

	it('creates an immutable GridCells message', function () {
		const message = createGridCells({
			frameId: 'map', stamp: { sec: 1, nanosec: 2 }, cellWidth: 0.5, cellHeight: 1,
			cells: [{ x: 1, y: 2, z: 0 }],
		});
		assert.deepEqual(message, {
			type: GUI_MESSAGE_TYPE.GRID_CELLS,
			frameId: 'map', stamp: { sec: 1, nanosec: 2 }, cellWidth: 0.5, cellHeight: 1,
			cells: [{ x: 1, y: 2, z: 0 }],
		});
		assert.throws(() => message.cells.push({ x: 0, y: 0, z: 0 }), TypeError);
		assert.throws(() => createGridCells({
			frameId: 'map', stamp: {}, cellWidth: NaN, cellHeight: 1, cells: [],
		}), TypeError);
	});

	it('creates an OccupancyGrid message with compact cell data', function () {
		const message = createOccupancyGrid({
			frameId: 'map', stamp: { sec: 1, nanosec: 2 }, resolution: 0.5, width: 2, height: 1,
			originPosition: { x: 1, y: 2, z: 0 }, originOrientation: { x: 0, y: 0, z: 0, w: 1 },
			data: [0, -1],
		});
		assert.equal(message.type, GUI_MESSAGE_TYPE.OCCUPANCY_GRID);
		assert.ok(message.data instanceof Int8Array);
		assert.deepEqual([...message.data], [0, -1]);
		assert.throws(() => createOccupancyGrid({
			frameId: 'map', stamp: {}, resolution: 0, width: 1, height: 1,
			originPosition: { x: 0, y: 0, z: 0 }, originOrientation: { x: 0, y: 0, z: 0, w: 1 }, data: [],
		}), TypeError);
	});

	it('creates an immutable IMU message with canonical fields', function () {
		const message = createImu({
			frameId: 'imu_link', stamp: { sec: 1, nanosec: 2 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			angularVelocity: { x: 1, y: 2, z: 3 },
			linearAcceleration: { x: 4, y: 5, z: 6 },
		});
		assert.deepEqual(message, {
			type: GUI_MESSAGE_TYPE.IMU, frameId: 'imu_link', stamp: { sec: 1, nanosec: 2 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			angularVelocity: { x: 1, y: 2, z: 3 }, linearAcceleration: { x: 4, y: 5, z: 6 },
		});
		assert.throws(() => { message.orientation.w = 0; }, TypeError);
		assert.throws(() => createImu({
			frameId: 'imu_link', stamp: {}, orientation: { x: 0, y: 0, z: 0, w: 1 },
			angularVelocity: { x: 1, y: 2 }, linearAcceleration: { x: 4, y: 5, z: 6 },
		}), TypeError);
	});
});
