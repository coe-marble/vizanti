import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { element, loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('inspector plugin', function () {
	it('preserves required template assets and placeholders', function () {
		runTemplateContract('inspector');
	});

	function configuration() {
		return {
			adapterId: 'ros2',
			adapterValues: {},
			endpointType: 'topic',
			endpoint: { topic: '/test', nativeMessageType: 'custom_msgs/msg/Data' },
		};
	}

	function loadConnect(overrides = {}) {
		return loadFunctions('inspector', [
			'activeEndpointConfiguration', 'deliveryOptions', 'disconnect',
			'createNestedDisplay', 'connect',
		], {
			endpointConfigurationEditor: { activeConfiguration: null },
			endpointService: { subscribeRaw: spy(), getTopicInfo: spy(async () => ({ publishers: ['node'] })) },
			subscription: undefined, previousTopic: '', throttle: element('100'),
			status: { setOK: spy(), setWarn: spy(), setError: spy() }, saveSettings: spy(),
			liveDataDiv: element(), infoDiv: element(),
			document: { createElement: () => element() },
			...overrides,
		});
	}

	it('requires a configured raw topic before subscribing', function () {
		const ctx = loadConnect();
		ctx.connect();
		assert.equal(ctx.endpointService.subscribeRaw.calls.length, 0);
		assert.deepEqual(ctx.status.setError.calls, [['Select a configured topic.']]);
	});

	it('subscribes through the adapter and clears data when the topic changes', function () {
		const subscription = { unsubscribe: spy() };
		const ctx = loadConnect({
			endpointConfigurationEditor: { activeConfiguration: configuration() },
			endpointService: { subscribeRaw: spy(() => subscription), getTopicInfo: spy(async () => ({ publishers: ['node'] })) },
		});
		ctx.connect();
		const [receivedConfiguration, onMessage, delivery] = ctx.endpointService.subscribeRaw.calls[0];
		assert.deepEqual(plain(receivedConfiguration), configuration());
		assert.equal(typeof onMessage, 'function');
		assert.deepEqual(plain(delivery), { throttleRate: 100, queueLength: 1 });
		assert.equal(ctx.liveDataDiv.innerHTML, '<p>Waiting for data...</p>');
		assert.equal(ctx.infoDiv.innerHTML, '<p>Waiting for data...</p>');
		assert.equal(ctx.previousTopic, '/test');
		assert.deepEqual(ctx.status.setWarn.calls, [['No data received.']]);
	});

	it('renders raw payloads with bounded strings and arrays', async function () {
		const subscription = { unsubscribe: spy() };
		const endpointService = {
			subscribeRaw: spy(() => subscription),
			getTopicInfo: spy(async () => ({ publishers: ['node'] })),
		};
		const ctx = loadConnect({
			endpointConfigurationEditor: { activeConfiguration: configuration() }, endpointService,
		});
		ctx.connect();
		const [, onMessage] = endpointService.subscribeRaw.calls[0];
		await onMessage({ long: 'x'.repeat(201), values: Array.from({ length: 55 }, (_, index) => index) });
		const rows = ctx.liveDataDiv.children[0].children.map(row => row.textContent);
		assert.equal(rows[0], `long: ${'x'.repeat(200)}... [truncated]`);
		assert.equal(rows[1], 'values: Array(55)');
		assert.equal(rows.length, 53);
		assert.equal(rows[52], '... 5 more items');
		assert.equal(ctx.infoDiv.children.length, 1);
		assert.equal(ctx.status.setOK.calls.length, 1);
	});

	it('unsubscribes the previous raw subscription before reconnecting', function () {
		const subscription = { unsubscribe: spy() };
		const ctx = loadConnect({
			endpointConfigurationEditor: { activeConfiguration: configuration() },
			endpointService: { subscribeRaw: spy(() => subscription), getTopicInfo: spy(async () => ({})) },
		});
		ctx.connect();
		ctx.connect();
		assert.deepEqual(subscription.unsubscribe.calls, [[]]);
		assert.equal(ctx.endpointService.subscribeRaw.calls.length, 2);
	});
});
