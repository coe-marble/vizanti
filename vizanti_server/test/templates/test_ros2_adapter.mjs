import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import { ENDPOINT_TYPE, assertAdapterContract } from '../../public/js/modules/adapters/contract.js';
import { binaryToUint8Array } from '../../public/js/modules/adapters/binary.js';
import { binaryToBase64 } from '../../public/js/modules/adapters/encoded_image.js';
import { GUI_MESSAGE_TYPE, createBatteryState, createBool, createEmpty, createFloat, createGridCells, createImage, createImu, createMarkerArray, createOdometry, createOccupancyGrid, createPath, createPointCloud, createPolygon, createPoseArray, createPoseWithCovariance, createRange } from '../../public/js/modules/gui_messages.js';

function loadAdapter(ROSLIB, rosbridge, serverApi) {
	const url = new URL('../../public/js/modules/adapters/ros2.js', import.meta.url);
	const source = fs.readFileSync(url, 'utf8')
		.replace(/^import .*;\n/gm, '')
		.replace(/export const /g, 'const ')
		.replace(/export function /g, 'function ')
		.concat('\nglobalThis.adapterExports = { createRos2Adapter, localRos2Instance };');
	const context = vm.createContext({ ROSLIB, rosbridge, serverApi, createRosTf: () => ({}), assertAdapterContract, binaryToUint8Array, binaryToBase64, ENDPOINT_TYPE, GUI_MESSAGE_TYPE, createBatteryState, createBool, createEmpty, createFloat, createGridCells, createImage, createImu, createMarkerArray, createOdometry, createOccupancyGrid, createPath, createPointCloud, createPolygon, createPoseArray, createPoseWithCovariance, createRange });
	new vm.Script(source, { filename: url.pathname }).runInContext(context);
	return context.adapterExports;
}

describe('ROS2 adapter', function () {
	function arrange(topicCatalog = { topics: ['/target'], types: ['std_msgs/msg/Float64'] }) {
		const topics = [];
		const services = [];
		const serverApiCalls = [];
		const serverApi = {
			getNodeParameters: async (node) => {
				serverApiCalls.push(['getNodeParameters', node]);
				return { parameters: [['speed', 2, 2]] };
			},
			setNodeParameter: async (node, name, value) => {
				serverApiCalls.push(['setNodeParameter', node, name, value]);
				return { success: true };
			},
			recordingStatus: async () => {
				serverApiCalls.push(['recordingStatus']);
				return { active: true, message: 'active' };
			},
			setRecording: async (request) => {
				serverApiCalls.push(['setRecording', request]);
				return { success: true, message: 'started' };
			},
		};
		class Topic {
			constructor(options) { this.options = options; topics.push(this); }
			subscribe(callback) { this.callback = callback; }
			unsubscribe(callback) { this.unsubscribedCallback = callback; }
			publish(message) { this.message = message; }
			unadvertise() { this.unadvertised = true; }
		}
		class Service {
			constructor(options) { this.options = options; services.push(this); }
			callService(request, resolve, reject) { this.request = request; this.resolve = resolve; this.reject = reject; }
		}
		class Message { constructor(value) { Object.assign(this, value); } }
		const ROSLIB = { Topic, Service, Message, ServiceRequest: Message };
		const bridge = {
			ros: { id: 'bridge' },
			async get_all_topics() { return topicCatalog; },
			async get_all_nodes() { return { nodes: ['/controller', '/vizanti/server'] }; },
			async get_services() { return ['/reset']; },
			async get_topic_publishers_and_subscribers(topic) { return { publishers: [topic], subscribers: [] }; },
		};
		const { createRos2Adapter, localRos2Instance } = loadAdapter(ROSLIB, bridge, serverApi);
		const tf = {};
		const adapter = createRos2Adapter({ ROSLIB, createTf: () => tf, getClient(instance) {
			assert.strictEqual(instance, localRos2Instance);
			return bridge;
		} });
		return { adapter, localRos2Instance, topics, services, serverApiCalls, tf };
	}

	it('declares namespace and TF frame as its configuration fields', function () {
		const { adapter } = arrange();
		assert.deepEqual(
			JSON.parse(JSON.stringify(adapter.configurationFields())),
			[
				{ id: 'namespace', label: 'Namespace', type: 'text', placeholder: '/robot_1', defaultValue: '' },
				{ id: 'tfFrame', label: 'TF frame', type: 'text', placeholder: 'base_link', defaultValue: 'base_link' },
			],
		);
	});

	it('declares topic and service fields for the endpoint editor', function () {
		const { adapter } = arrange();
		assert.deepEqual(JSON.parse(JSON.stringify(
			adapter.endpointFields(ENDPOINT_TYPE.TOPIC, GUI_MESSAGE_TYPE.FLOAT),
		)), [
			{ id: 'outputMessageId', label: 'Message', control: 'message' },
			{ id: 'endpointId', label: 'Topic', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Topic name' } },
		]);
		assert.deepEqual(JSON.parse(JSON.stringify(
			adapter.endpointFields(ENDPOINT_TYPE.SERVICE, GUI_MESSAGE_TYPE.FLOAT),
		)), [
			{ id: 'serviceType', label: 'Service Type', control: 'text', placeholder: 'package_name/srv/Service' },
			{ id: 'endpointId', label: 'Service', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Service name' } },
		]);
		assert.deepEqual(JSON.parse(JSON.stringify(
			adapter.endpointFields(ENDPOINT_TYPE.SERVICE, GUI_MESSAGE_TYPE.BOOL),
		)), [
			{ id: 'endpointId', label: 'Service', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Service name' } },
		]);
	});

	it('declares discovery support independently from endpoint fields', function () {
		const { adapter } = arrange();
		assert.equal(adapter.allowsDiscovery(ENDPOINT_TYPE.TOPIC, GUI_MESSAGE_TYPE.FLOAT), true);
		assert.equal(adapter.allowsDiscovery(ENDPOINT_TYPE.SERVICE, GUI_MESSAGE_TYPE.FLOAT), true);
		assert.equal(adapter.allowsDiscovery(ENDPOINT_TYPE.TOPIC, GUI_MESSAGE_TYPE.BOOL), true);
	});

	it('discovers ROS topics through the adapter', async function () {
		const { adapter, localRos2Instance } = arrange({
			topics: ['/battery', '/odom'], types: ['sensor_msgs/msg/BatteryState', 'nav_msgs/msg/Odometry'],
		});
		const topics = await adapter.discoverEndpoints(localRos2Instance, {}, ENDPOINT_TYPE.TOPIC);
		assert.deepEqual(JSON.parse(JSON.stringify(topics)), [
			{ id: '/battery', label: '/battery', messageType: 'sensor_msgs/msg/BatteryState' },
			{ id: '/odom', label: '/odom', messageType: 'nav_msgs/msg/Odometry' },
		]);
	});

	it('exposes node parameter management through the server API', async function () {
		const { adapter, localRos2Instance, serverApiCalls } = arrange();
		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.listNodes(localRos2Instance, {}),
		)), ['/controller']);

		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.getNodeParameters(localRos2Instance, {}, '/controller'),
		)), [['speed', 2, 2]]);
		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.setNodeParameter(localRos2Instance, {}, '/controller', 'speed', 2.5),
		)), { success: true });
		assert.deepEqual(serverApiCalls, [
			['getNodeParameters', '/controller'],
			['setNodeParameter', '/controller', 'speed', 2.5],
		]);
	});

	it('exposes generic recording through adapter-owned operations', async function () {
		const { adapter, localRos2Instance, serverApiCalls } = arrange({
			topics: ['/scan', '/vizanti/tf_consolidated'],
			types: ['sensor_msgs/msg/LaserScan', 'tf2_msgs/msg/TFMessage'],
		});
		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.discoverEndpoints(localRos2Instance, {}, ENDPOINT_TYPE.TOPIC),
		)), [{ id: '/scan', label: '/scan', messageType: 'sensor_msgs/msg/LaserScan' }]);

		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.recordingStatus(localRos2Instance, {}),
		)), { active: true, message: 'active' });

		const recordingRequest = {
			topics: ['/scan'], start: true, path: '/tmp/recording',
		};
		assert.deepEqual(JSON.parse(JSON.stringify(
			await adapter.setRecording(localRos2Instance, {}, recordingRequest),
		)), { success: true, message: 'started' });
		assert.deepEqual(JSON.parse(JSON.stringify(serverApiCalls)), [
			['recordingStatus'], ['setRecording', recordingRequest],
		]);
	});

	it('provides ROS2-specific shell shortcuts', function () {
		const { adapter, localRos2Instance } = arrange();
		assert.deepEqual(JSON.parse(JSON.stringify(adapter.commandShortcuts(localRos2Instance, {}))), [
			{ id: 'ros2-run', label: 'ros2 run', command: 'ros2 run ', background: true },
			{ id: 'ros2-launch', label: 'ros2 launch', command: 'ros2 launch ', background: true },
			{ id: 'ros2-doctor', label: 'ros2 doctor', command: 'ros2 doctor --report' },
		]);
	});

	it('creates and reuses the ROS TF service', function () {
		const { adapter, localRos2Instance, tf } = arrange();
		assert.strictEqual(adapter.getTf(localRos2Instance), tf);
		assert.strictEqual(adapter.getTf(localRos2Instance), tf);
	});

	it('limits endpoint choices to the configured namespace', async function () {
		const { adapter, localRos2Instance } = arrange({
			topics: ['/alpha/altitude', '/bravo/altitude'],
			types: ['std_msgs/msg/Float64', 'std_msgs/msg/Float64'],
		});
		const endpoints = await adapter.discoverEndpoints(
			localRos2Instance, { namespace: '/alpha' }, ENDPOINT_TYPE.TOPIC,
			GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64', {},
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoints.map((endpoint) => endpoint.id))), ['/alpha/altitude']);
	});

	it('turns a manually entered relative address into a namespaced endpoint', function () {
		const { adapter, localRos2Instance } = arrange();
		const endpoint = adapter.createManualEndpoint(
			localRos2Instance, { namespace: '/alpha' }, ENDPOINT_TYPE.TOPIC,
			GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64', 'depth_target', {},
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoint)), {
			id: 'depth_target',
			label: 'depth_target',
			endpoint: { topic: '/alpha/depth_target', nativeMessageType: 'std_msgs/msg/Float64' },
		});
	});

	it('turns a manually entered service into a concrete ROS endpoint', function () {
		const { adapter, localRos2Instance } = arrange();
		const endpoint = adapter.createManualEndpoint(
			localRos2Instance, { namespace: '/alpha' }, ENDPOINT_TYPE.SERVICE,
			undefined, '', 'reset', { serviceType: 'std_srvs/srv/Trigger' },
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoint)), {
			id: 'reset', label: 'reset',
			endpoint: { service: '/alpha/reset', serviceType: 'std_srvs/srv/Trigger' },
		});
	});

	it('uses SetBool as the concrete service type for Bool requests', function () {
		const { adapter, localRos2Instance } = arrange();
		const endpoint = adapter.createManualEndpoint(
			localRos2Instance, { namespace: '/alpha' }, ENDPOINT_TYPE.SERVICE,
			GUI_MESSAGE_TYPE.BOOL, '', 'set_enabled', {},
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoint)), {
			id: 'set_enabled', label: 'set_enabled',
			endpoint: { service: '/alpha/set_enabled', serviceType: 'std_srvs/srv/SetBool' },
		});
	});

	it('subscribes with the configured ROS topic and type', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		let value;
		const onValue = received => { value = received; };
		const subscription = adapter.subscribe(localRos2Instance, {
		}, {
			topic: '/altitude_target', nativeMessageType: 'std_msgs/msg/Float64',
		}, GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64', onValue);
		assert.deepEqual(topics[0].options, {
			ros: { id: 'bridge' }, name: '/altitude_target', messageType: 'std_msgs/msg/Float64',
		});
		topics[0].callback({ data: 3.5 });
		assert.deepEqual(value, { type: GUI_MESSAGE_TYPE.FLOAT, value: 3.5 });
		subscription.unsubscribe();
		assert.strictEqual(typeof topics[0].unsubscribedCallback, 'function');
	});

	it('normalizes PointCloud2 indexed byte objects into the GUI contract', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/cloud'], types: ['sensor_msgs/msg/PointCloud2'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/cloud', nativeMessageType: 'sensor_msgs/msg/PointCloud2',
		}, GUI_MESSAGE_TYPE.POINT_CLOUD, 'sensor_msgs/msg/PointCloud2', (message) => { value = message; });
		topics[0].callback({
			header: { frame_id: 'sensor', stamp: { sec: 1, nanosec: 2 } },
			width: 1, height: 1,
			fields: [{ name: 'x', offset: 0, datatype: 7, count: 1 }],
			is_bigendian: false, point_step: 4, row_step: 4,
			data: { 0: 0, 1: 0, 2: 128, 3: 63 }, is_dense: true,
		});
		assert.deepEqual(value, {
			type: GUI_MESSAGE_TYPE.POINT_CLOUD,
			frameId: 'sensor', stamp: { sec: 1, nanosec: 2 },
			width: 1, height: 1,
			fields: [{ name: 'x', offset: 0, datatype: 7, count: 1 }],
			isBigEndian: false, pointStep: 4, rowStep: 4,
			data: [0, 0, 128, 63], isDense: true,
		});
	});

	it('subscribes to raw topic payloads and retrieves topic metadata', async function () {
		const { adapter, localRos2Instance, topics } = arrange();
		let received;
		const subscription = adapter.subscribeRaw(localRos2Instance, {}, {
			topic: '/custom', nativeMessageType: 'custom_msgs/msg/Data',
		}, (message) => { received = message; }, { throttleRate: 100, queueLength: 1 });
		assert.deepEqual(topics[0].options, {
			ros: { id: 'bridge' }, name: '/custom', messageType: 'custom_msgs/msg/Data',
			throttle_rate: 100, queue_length: 1,
		});
		topics[0].callback({ nested: { value: 4 } });
		assert.deepEqual(received, { nested: { value: 4 } });
		subscription.unsubscribe();
		assert.strictEqual(typeof topics[0].unsubscribedCallback, 'function');
		assert.deepEqual(await adapter.getTopicInfo(localRos2Instance, {}, { topic: '/custom' }), {
			publishers: ['/custom'], subscribers: [],
		});
	});

	it('converts BatteryState topics into the stable GUI message contract', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/battery'], types: ['sensor_msgs/msg/BatteryState'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/battery', nativeMessageType: 'sensor_msgs/msg/BatteryState',
		}, GUI_MESSAGE_TYPE.BATTERY_STATE, 'sensor_msgs/msg/BatteryState', (message) => { value = message; });
		topics[0].callback({
			percentage: 0.5, voltage: 12.3, current: 1.2, charge: 2, capacity: 4,
			cell_voltage: [3.1, 3.2], power_supply_status: 2,
			power_supply_health: 1, power_supply_technology: 3,
		});
		assert.deepEqual(value, {
			type: GUI_MESSAGE_TYPE.BATTERY_STATE,
			percentage: 0.5, voltage: 12.3, current: 1.2, charge: 2, capacity: 4,
			cellVoltage: [3.1, 3.2], powerSupplyStatus: 2,
			powerSupplyHealth: 1, powerSupplyTechnology: 3,
		});
	});

	it('converts Bool and IMU topics into stable GUI messages', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/enabled', '/imu'], types: ['std_msgs/msg/Bool', 'sensor_msgs/msg/Imu'],
		});
		let enabled;
		let imu;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/enabled', nativeMessageType: 'std_msgs/msg/Bool',
		}, GUI_MESSAGE_TYPE.BOOL, 'std_msgs/msg/Bool', (message) => { enabled = message; });
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/imu', nativeMessageType: 'sensor_msgs/msg/Imu',
		}, GUI_MESSAGE_TYPE.IMU, 'sensor_msgs/msg/Imu', (message) => { imu = message; });
		topics[0].callback({ data: true });
		topics[1].callback({
			header: { frame_id: 'imu_link', stamp: { sec: 1, nanosec: 2 } },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			angular_velocity: { x: 1, y: 2, z: 3 },
			linear_acceleration: { x: 4, y: 5, z: 6 },
		});
		assert.deepEqual(enabled, { type: GUI_MESSAGE_TYPE.BOOL, value: true });
		assert.deepEqual(imu, {
			type: GUI_MESSAGE_TYPE.IMU, frameId: 'imu_link', stamp: { sec: 1, nanosec: 2 },
			orientation: { x: 0, y: 0, z: 0, w: 1 },
			angularVelocity: { x: 1, y: 2, z: 3 }, linearAcceleration: { x: 4, y: 5, z: 6 },
		});
	});

	it('maps navigation and range topics into their stable GUI contracts', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		const received = [];
		const subscribe = (type, nativeType, payload) => {
			adapter.subscribe(localRos2Instance, {}, { topic: `/${received.length}`, nativeMessageType: nativeType },
				type, nativeType, (message) => received.push(message));
			topics.at(-1).callback(payload);
		};
		const header = { frame_id: 'map', stamp: { sec: 1, nanosec: 2 } };
		const pose = { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
		subscribe(GUI_MESSAGE_TYPE.ODOMETRY, 'nav_msgs/msg/Odometry', { header, pose: { pose }, child_frame_id: 'base_link' });
		subscribe(GUI_MESSAGE_TYPE.PATH, 'nav_msgs/msg/Path', { header, poses: [{ header, pose }] });
		subscribe(GUI_MESSAGE_TYPE.POSE_ARRAY, 'geometry_msgs/msg/PoseArray', { header, poses: [pose] });
		subscribe(GUI_MESSAGE_TYPE.RANGE, 'sensor_msgs/msg/Range', {
			header, radiation_type: 0, field_of_view: 1, min_range: 0.1, max_range: 4, range: 2,
		});
		assert.deepEqual(received[0], {
			type: GUI_MESSAGE_TYPE.ODOMETRY, frameId: 'map', stamp: { sec: 1, nanosec: 2 },
			position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, childFrameId: 'base_link',
		});
		assert.equal(received[1].type, GUI_MESSAGE_TYPE.PATH);
		assert.equal(received[2].type, GUI_MESSAGE_TYPE.POSE_ARRAY);
		assert.deepEqual(received[3], {
			type: GUI_MESSAGE_TYPE.RANGE, frameId: 'map', stamp: { sec: 1, nanosec: 2 }, radiationType: 0,
			fieldOfView: 1, minRange: 0.1, maxRange: 4, range: 2,
		});
	});

	it('normalizes compressed ROS images into the stable Image contract', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/camera'], types: ['sensor_msgs/msg/CompressedImage'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/camera', nativeMessageType: 'sensor_msgs/msg/CompressedImage',
		}, GUI_MESSAGE_TYPE.IMAGE, 'sensor_msgs/msg/CompressedImage', (message) => { value = message; }, {
			throttleRate: 500, queueLength: 1,
		});
		topics[0].callback({
			header: { frame_id: 'camera' }, format: '16UC1; compressedDepth png',
			data: 'prefixiVBORw0KGgoDATA',
		});
		assert.deepEqual(value, {
			type: GUI_MESSAGE_TYPE.IMAGE,
			mimeType: 'image/png', base64Data: 'iVBORw0KGgoDATA', frameId: 'camera',
			encoding: '16uc1', compression: 'png', isDepth: true,
		});
		assert.deepEqual(topics[0].options, {
			ros: { id: 'bridge' }, name: '/camera', messageType: 'sensor_msgs/msg/CompressedImage',
			throttle_rate: 500, queue_length: 1,
		});
	});

	it('publishes Polygon messages as ROS PolygonStamped messages', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		adapter.publish(localRos2Instance, {}, {
			topic: '/area', nativeMessageType: 'geometry_msgs/msg/PolygonStamped',
		}, 'geometry_msgs/msg/PolygonStamped', createPolygon({
			frameId: 'map', stamp: { sec: 1, nanosec: 2 },
			points: [{ x: 1, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }, { x: 3, y: 4, z: 0 }],
		}));
		assert.deepEqual(topics[0].message, {
			header: { stamp: { sec: 1, nanosec: 2 }, frame_id: 'map' },
			polygon: { points: [{ x: 1, y: 2, z: 0 }, { x: 3, y: 2, z: 0 }, { x: 3, y: 4, z: 0 }] },
		});
	});

	it('publishes PoseWithCovariance messages as ROS PoseWithCovarianceStamped messages', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		const covariance = Array.from({ length: 36 }, (_, index) => index);
		adapter.publish(localRos2Instance, {}, {
			topic: '/initialpose', nativeMessageType: 'geometry_msgs/msg/PoseWithCovarianceStamped',
		}, 'geometry_msgs/msg/PoseWithCovarianceStamped', createPoseWithCovariance({
			frameId: 'map', stamp: { sec: 1, nanosec: 2 },
			position: { x: 3, y: 4, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, covariance,
		}));
		assert.deepEqual(topics[0].message, {
			header: { stamp: { sec: 1, nanosec: 2 }, frame_id: 'map' },
			pose: {
				pose: { position: { x: 3, y: 4, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
				covariance,
			},
		});
	});

	it('converts MarkerArray topics into the stable marker schema', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/markers'], types: ['visualization_msgs/msg/MarkerArray'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/markers', nativeMessageType: 'visualization_msgs/msg/MarkerArray',
		}, GUI_MESSAGE_TYPE.MARKER_ARRAY, 'visualization_msgs/msg/MarkerArray', (message) => { value = message; });
		topics[0].callback({
			markers: [{
				header: { frame_id: 'map', stamp: { sec: 1, nanosec: 2 } }, ns: 'route', id: 4, type: 4, action: 0,
				pose: { position: { x: 3, y: 4, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
				scale: { x: 0.1, y: 0.2, z: 0.3 }, color: { r: 1, g: 0, b: 0, a: 1 },
				lifetime: { sec: 5, nanosec: 0 }, points: [{ x: 0, y: 1, z: 2 }],
				colors: [{ r: 0, g: 1, b: 0, a: 1 }], text: 'route',
			}],
		});
		assert.deepEqual(value, {
			type: GUI_MESSAGE_TYPE.MARKER_ARRAY,
			markers: [{
				frameId: 'map', frameStamp: { sec: 1, nanosec: 2 }, namespace: 'route', id: 4, type: 4, action: 0,
				position: { x: 3, y: 4, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 },
				scale: { x: 0.1, y: 0.2, z: 0.3 }, color: { r: 1, g: 0, b: 0, a: 1 },
				lifetime: { sec: 5, nanosec: 0 }, points: [{ x: 0, y: 1, z: 2 }],
				colors: [{ r: 0, g: 1, b: 0, a: 1 }], text: 'route',
			}],
		});
	});

	it('converts GridCells topics into the stable grid-cell schema', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/grid_cells'], types: ['nav_msgs/msg/GridCells'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/grid_cells', nativeMessageType: 'nav_msgs/msg/GridCells',
		}, GUI_MESSAGE_TYPE.GRID_CELLS, 'nav_msgs/msg/GridCells', (message) => { value = message; });
		topics[0].callback({
			header: { frame_id: 'map', stamp: { sec: 1, nanosec: 2 } },
			cell_width: 0.5, cell_height: 1,
			cells: [{ x: 1, y: 2, z: 0 }],
		});
		assert.deepEqual(value, {
			type: GUI_MESSAGE_TYPE.GRID_CELLS,
			frameId: 'map', stamp: { sec: 1, nanosec: 2 }, cellWidth: 0.5, cellHeight: 1,
			cells: [{ x: 1, y: 2, z: 0 }],
		});
	});

	it('converts OccupancyGrid topics into the stable occupancy-grid schema', function () {
		const { adapter, localRos2Instance, topics } = arrange({
			topics: ['/map'], types: ['nav_msgs/msg/OccupancyGrid'],
		});
		let value;
		adapter.subscribe(localRos2Instance, {}, {
			topic: '/map', nativeMessageType: 'nav_msgs/msg/OccupancyGrid',
		}, GUI_MESSAGE_TYPE.OCCUPANCY_GRID, 'nav_msgs/msg/OccupancyGrid', (message) => { value = message; });
		topics[0].callback({
			header: { frame_id: 'map', stamp: { sec: 1, nanosec: 2 } },
			info: {
				resolution: 0.5, width: 2, height: 1,
				origin: { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
			},
			data: [0, -1],
		});
		assert.equal(value.type, GUI_MESSAGE_TYPE.OCCUPANCY_GRID);
		assert.deepEqual(JSON.parse(JSON.stringify(value)), {
			type: GUI_MESSAGE_TYPE.OCCUPANCY_GRID,
			frameId: 'map', stamp: { sec: 1, nanosec: 2 }, resolution: 0.5, width: 2, height: 1,
			originPosition: { x: 1, y: 2, z: 0 }, originOrientation: { x: 0, y: 0, z: 0, w: 1 },
			data: { 0: 0, 1: -1 },
		});
	});

	it('publishes one ROS message and releases its publisher', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		adapter.publish(localRos2Instance, {}, {
			topic: '/altitude_target', nativeMessageType: 'std_msgs/msg/Float64',
	}, 'std_msgs/msg/Float64', createFloat(2.5));
		assert.equal(topics[0].message.data, 2.5);
		assert.equal(topics[0].unadvertised, true);
	});

	it('calls a ROS service and resolves its response', async function () {
		const { adapter, localRos2Instance, services } = arrange();
		const response = adapter.call(localRos2Instance, {}, {
			service: '/reset', serviceType: 'example_interfaces/srv/Trigger',
		}, {});
		services[0].resolve({ success: true });
		assert.deepEqual(await response, { success: true });
	});

	it('serializes a stable Bool request for a SetBool service', async function () {
		const { adapter, localRos2Instance, services } = arrange();
		const response = adapter.call(localRos2Instance, {}, {
			service: '/set_enabled', serviceType: 'std_srvs/srv/SetBool',
		}, createBool(true));
		assert.deepEqual(services[0].request, { data: true });
		services[0].resolve({ success: true, message: 'updated' });
		assert.deepEqual(await response, { success: true, message: 'updated' });
	});

	it('rejects incomplete topic endpoints', function () {
		const { adapter, localRos2Instance } = arrange();
		assert.throws(
			() => adapter.subscribe(localRos2Instance, {}, {
				topic: '/target', nativeMessageType: 'std_msgs/msg/Float64',
			}, GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64'),
		/message callback/,
		);
	});
});
