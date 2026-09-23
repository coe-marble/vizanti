import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, plain, spy } from './plugin_harness.mjs';

const mapMessage = {
	frameId: 'map', stamp: { sec: 1, nanosec: 2 }, resolution: 0.5, width: 2, height: 1,
	originPosition: { x: 1, y: 2, z: 0 }, originOrientation: { x: 0, y: 0, z: 0, w: 1 },
	data: new Int8Array([0, -1]),
};

describe('map plugin', function () {
	it('preserves required template assets and placeholders', function () {
		runTemplateContract('map');
	});

	it('transforms the stable map origin and forwards the selected colour scheme to the worker', function () {
		const transformed = { translation: { x: 4 } };
		const transform = spy(() => transformed);
		const workerThread = { postMessage: spy() };
		const ctx = loadFunctions('map', ['queueWorkerMsg'], {
			tf: { transformPoseStamped: transform }, workerThread,
			colourSchemeBox: { value: 'costmap' }, newMapData: undefined,
		});
		ctx.queueWorkerMsg(mapMessage, 'map');
		assert.deepStrictEqual(plain(transform.calls[0]), [
			{ frameId: 'map', stamp: { sec: 1, nanosec: 2 } },
			mapMessage.originPosition, mapMessage.originOrientation,
		]);
		assert.strictEqual(ctx.newMapData.message, mapMessage);
		assert.equal(ctx.newMapData.frameId, 'map');
		assert.strictEqual(ctx.newMapData.pose, transformed);
		assert.strictEqual(workerThread.postMessage.calls[0][0].map_msg, mapMessage);
		assert.strictEqual(workerThread.postMessage.calls[0][0].colour_scheme, 'costmap');
	});

	it('subscribes through the endpoint service with bounded delivery', function () {
		const status = { setOK: spy(), setWarn: spy(), setError: spy() };
		const tf = { fixed_frame: 'map', absoluteTransforms: { map: {} }, frame_list: new Set() };
		const subscription = { unsubscribe: spy() };
		let callback;
		const endpointService = {
			getTf: spy(() => tf),
			subscribe: spy((configuration, messageType, onMessage, options) => {
				callback = onMessage;
				assert.deepStrictEqual(plain(options), { throttleRate: 100, queueLength: 1 });
				return subscription;
			}),
		};
		const configuration = { adapterId: 'ros2', endpoint: { topic: '/map' } };
		const queueWorkerMsg = spy();
		const ctx = loadFunctions('map', ['disconnect', 'connect'], {
			activeEndpointConfiguration: () => configuration,
			endpointService, endpointMessageType: 'vizanti/OccupancyGrid', status,
			subscription: undefined, deliveryOptions: () => ({ throttleRate: 100, queueLength: 1 }),
			queueWorkerMsg, saveSettings: spy(), tf,
		});
		ctx.connect();
		assert.deepStrictEqual(plain(endpointService.subscribe.calls[0].slice(0, 2)), [configuration, 'vizanti/OccupancyGrid']);
		assert.equal(status.setWarn.calls[0][0], 'No data received.');
		callback(mapMessage);
		assert.deepStrictEqual(plain(queueWorkerMsg.calls[0]), [mapMessage, 'map']);
	});

	for (const [width, height] of [[0, 5], [5, 0]]) {
		it(`does not dispatch an empty ${width} x ${height} map`, function () {
			const status = { setOK: spy(), setWarn: spy(), setError: spy() };
			let callback;
			const ctx = loadFunctions('map', ['disconnect', 'connect'], {
				activeEndpointConfiguration: () => ({ adapterId: 'ros2', endpoint: { topic: '/map' } }),
				endpointService: {
					getTf: () => ({ fixed_frame: 'map', absoluteTransforms: { map: {} }, frame_list: new Set() }),
					subscribe: (configuration, type, onMessage) => { callback = onMessage; return { unsubscribe: spy() }; },
				},
				endpointMessageType: 'vizanti/OccupancyGrid', status, subscription: undefined,
				deliveryOptions: () => ({}), queueWorkerMsg: spy(), saveSettings: spy(), tf: {},
			});
			ctx.connect();
			callback({ ...mapMessage, width, height });
			assert.strictEqual(ctx.queueWorkerMsg.calls.length, 0);
			assert.strictEqual(status.setWarn.calls[1][0], 'Received empty map.');
		});
	}

	it('rejects a map in an unknown non-map frame', function () {
		const status = { setOK: spy(), setWarn: spy(), setError: spy() };
		let callback;
		const ctx = loadFunctions('map', ['disconnect', 'connect'], {
			activeEndpointConfiguration: () => ({ adapterId: 'ros2', endpoint: { topic: '/map' } }),
			endpointService: {
				getTf: () => ({ fixed_frame: 'map', absoluteTransforms: {}, frame_list: new Set() }),
				subscribe: (configuration, type, onMessage) => { callback = onMessage; return { unsubscribe: spy() }; },
			},
			endpointMessageType: 'vizanti/OccupancyGrid', status, subscription: undefined,
			deliveryOptions: () => ({}), queueWorkerMsg: spy(), saveSettings: spy(), tf: {},
		});
		ctx.connect();
		callback({ ...mapMessage, frameId: 'missing' });
		assert.strictEqual(status.setError.calls[0][0], 'Required transform frame "missing" not found.');
		assert.strictEqual(ctx.queueWorkerMsg.calls.length, 0);
	});
});
