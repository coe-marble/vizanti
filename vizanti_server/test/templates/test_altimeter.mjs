import assert from 'assert';
import fs from 'fs';
import { runTemplateContract } from './template_test_helpers.mjs';
import { element, loadFunctions, plain, spy } from './plugin_harness.mjs';

const MODES = {
	altitude_positive: { dir: 'altitude', invert: false },
	altitude_negative: { dir: 'altitude', invert: true },
	depth_negative: { dir: 'depth', invert: true },
	depth_positive: { dir: 'depth', invert: false },
};

describe('altimeter plugin', function () {
	it('preserves the template contract', function () {
		runTemplateContract('altimeter');
	});

	it('uses one shared endpoint configuration container in the plugin modal', function () {
		const modal = fs.readFileSync(new URL('../../public/templates/altimeter/altimeter_modal.html', import.meta.url), 'utf8');
		assert(modal.includes('{uniqueID}_endpoint_configuration'));
		assert(!modal.includes('{uniqueID}_manual_endpoint'));
		assert(!modal.includes('{uniqueID}_robot_endpoint'));
		assert(!modal.includes('{uniqueID}_frame'));
		assert(!modal.includes('<h4>Click Target</h4>'));
	});

	function meterContext(overrides = {}) {
		return loadFunctions('altimeter', ['getMeters'], {
			frame: 'base_link',
			tf: { absoluteTransforms: {} },
			modeSelector: element('altitude_positive'),
			status: { setOK: spy(), setError: spy() },
			MODES,
			...overrides,
		});
	}

	it('reads altitude from the selected frame transform', function () {
		const ctx = meterContext({ tf: { absoluteTransforms: { base_link: { translation: { z: 3 } } } } });
		assert.equal(ctx.getMeters(), 3);
		assert.equal(ctx.status.setOK.calls.length, 1);
	});

	it('clamps inverted depth below zero', function () {
		const ctx = meterContext({
			tf: { absoluteTransforms: { base_link: { translation: { z: 3 } } } },
			modeSelector: element('depth_negative'),
		});
		assert.equal(ctx.getMeters(), 0);
	});

	it('reports a missing selected frame', function () {
		const ctx = meterContext();
		assert.equal(ctx.getMeters(), 0);
		assert.equal(ctx.status.setError.calls[0][0], 'Required transform frame "base_link" not found.');
	});

	it('does not use the endpoint editor until it is constructed', function () {
		const ctx = loadFunctions('altimeter', ['activeEndpointConfiguration'], {
			endpointConfigurationEditor: undefined,
		});
		assert.equal(ctx.activeEndpointConfiguration(), null);
	});

	it('uses the Manual adapter TF frame', function () {
		const ctx = loadFunctions('altimeter', ['configuredFrameFor'], {
			vehicleSelectionModule: { getRegisteredVehicles: () => [] },
		});
		assert.equal(ctx.configuredFrameFor({
			mode: 'manual',
			manualAdapterConfiguration: { values: { tfFrame: 'manual/base_link' } },
		}), 'manual/base_link');
	});

	it('uses the selected Robot Model TF frame', function () {
		const ctx = loadFunctions('altimeter', ['configuredFrameFor'], {
			vehicleSelectionModule: {
				getRegisteredVehicles: () => [{
					id: 'robot-alpha',
					adapterConfiguration: { values: { tfFrame: 'alpha/base_link' } },
				}],
			},
		});
		assert.equal(ctx.configuredFrameFor({
			mode: 'robotmodel', robotModelId: 'robot-alpha',
		}), 'alpha/base_link');
	});

	function endpointContext(overrides = {}) {
		const manualConfiguration = {
			adapterId: 'local-ros2',
			adapterValues: { namespace: '/alpha', tfFrame: 'alpha/base_link' },
			outputMessageId: 'std_msgs/msg/Float64',
			endpointId: '/alpha/depth_target',
			endpoint: { topic: '/alpha/depth_target', nativeMessageType: 'std_msgs/msg/Float64' },
		};
		const subscriptions = [];
		const published = [];
		const endpointService = {
			subscribe: spy((configuration, messageType, callback) => {
				const subscription = { configuration, messageType, callback, unsubscribe: spy() };
				subscriptions.push(subscription);
				return subscription;
			}),
			publish: spy((configuration, message) => published.push({ configuration, message })),
		};
		const ctx = loadFunctions('altimeter', [
			'activeEndpointConfiguration', 'connect', 'publishTarget',
		], {
			endpointConfigurationEditor: { activeConfiguration: manualConfiguration },
			endpointMessageType: 'vizanti/Float',
			endpointService,
			guiMessages: { createFloat: value => ({ type: 'vizanti/Float', value }) },
			subscription: undefined,
			target: NaN,
			text_target: element(),
			modeSelector: element('altitude_positive'),
			MODES,
			drawWidget: spy(),
			saveSettings: spy(),
			...overrides,
		});
		return { ctx, endpointService, manualConfiguration, published, subscriptions };
	}

	it('publishes a Vizanti Float through the manual endpoint', function () {
		const { ctx, published, manualConfiguration } = endpointContext();
		ctx.publishTarget(2.5);
		assert.deepStrictEqual(plain(published[0]), {
			configuration: manualConfiguration,
			message: { type: 'vizanti/Float', value: 2.5 },
		});
	});

	it('subscribes through the endpoint service with the configured GUI type', function () {
		const { ctx, subscriptions, manualConfiguration } = endpointContext();
		ctx.connect();
		assert.deepStrictEqual(plain(subscriptions[0].configuration), manualConfiguration);
		assert.equal(subscriptions[0].messageType, 'vizanti/Float');
	});

	it('replaces the existing endpoint subscription on reconnect', function () {
		const { ctx, subscriptions } = endpointContext();
		ctx.connect();
		ctx.connect();
		assert.equal(subscriptions[0].unsubscribe.calls.length, 1);
		assert.equal(subscriptions.length, 2);
	});

	it('uses the selected Robot Model adapter configuration with a plugin endpoint', function () {
		const robotEndpoint = {
			outputMessageId: 'std_msgs/msg/Float32', endpointId: '/alpha/depth_target',
			endpoint: { topic: '/alpha/depth_target', nativeMessageType: 'std_msgs/msg/Float32' },
		};
		const { ctx } = endpointContext({
			endpointConfigurationEditor: {
				activeConfiguration: {
					...robotEndpoint,
					adapterId: 'local-ros2',
					adapterValues: { namespace: '/alpha', tfFrame: 'alpha/base_link' },
				},
			},
		});
		assert.deepStrictEqual(plain(ctx.activeEndpointConfiguration()), {
			...robotEndpoint,
			adapterId: 'local-ros2',
			adapterValues: { namespace: '/alpha', tfFrame: 'alpha/base_link' },
		});
	});

	it('inverts published targets in negative depth mode', function () {
		const { ctx, published } = endpointContext({ modeSelector: element('depth_negative') });
		ctx.publishTarget(2.5);
		assert.equal(published[0].message.value, -2.5);
	});
});
