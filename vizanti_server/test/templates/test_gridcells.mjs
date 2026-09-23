import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, plain, spy } from './plugin_harness.mjs';

describe('gridcells plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('gridcells');
    });

    function arrange(configuration = { adapterId: 'ros2', endpoint: { topic: '/grid_cells' } }) {
        const pose = { translation: { x: 1, y: 2, z: 0 }, rotation: {} };
        const tf = {
            fixed_frame: 'map',
            getAbsoluteTransform: spy(() => pose),
        };
        const subscriptions = [];
        const endpointService = {
            getTf: spy(() => tf),
            subscribe: spy(() => {
                const subscription = { unsubscribe: spy() };
                subscriptions.push(subscription);
                return subscription;
            }),
        };
        const ctx = loadFunctions(
            'gridcells', ['getEndpointConfiguration', 'deliveryOptions', 'transformFor', 'connect'],
            environment({
                endpointConfigurationEditor: { activeConfiguration: configuration }, endpointService,
                endpointMessageType: 'vizanti/GridCells', subscription: undefined, data: { old: true },
                tf, timestampCheckbox: { checked: false }, drawCells: spy(),
            }),
        );
        ctx.connect();
        return { ctx, endpointService, subscriptions, tf, pose };
    }

    const message = {
        type: 'vizanti/GridCells', frameId: 'map', stamp: { sec: 1, nanosec: 2 },
        cellWidth: 1, cellHeight: 2, cells: [{ x: 1, y: 2, z: 0 }],
    };

    it('subscribes through the selected endpoint and uses its TF adapter', function () {
        const { ctx, endpointService } = arrange();
        const [configuration, messageType, callback, deliveryOptions] = endpointService.subscribe.calls[0];
        assert.deepEqual(plain(configuration), { adapterId: 'ros2', endpoint: { topic: '/grid_cells' } });
        assert.equal(messageType, 'vizanti/GridCells');
        assert.equal(typeof callback, 'function');
        assert.deepEqual(plain(deliveryOptions), { throttleRate: 100, queueLength: 1 });
        assert.deepEqual(endpointService.getTf.calls, [['ros2']]);
        assert.deepEqual(ctx.status.setWarn.calls, [['No data received.']]);
    });

    it('unsubscribes before creating a replacement endpoint subscription', function () {
        const { ctx, endpointService, subscriptions } = arrange();
        ctx.connect();
        assert.equal(subscriptions[0].unsubscribe.calls.length, 1);
        assert.equal(endpointService.subscribe.calls.length, 2);
    });

    it('requires a configured endpoint before subscribing', function () {
        const { ctx, endpointService } = arrange(null);
        assert.equal(endpointService.subscribe.calls.length, 0);
        assert.deepEqual(ctx.status.setError.calls, [['Select a configured endpoint.']]);
    });

    it('clears stale cells when receiving an empty grid', function () {
        const { ctx, endpointService } = arrange();
        endpointService.subscribe.calls[0][2]({ ...message, cells: [] });
        assert.strictEqual(ctx.data, undefined);
        assert.strictEqual(ctx.drawCells.calls.length, 1);
        assert.deepEqual(ctx.status.setWarn.calls[1], ['Received empty grid. Oh no! Anyway...']);
    });
    for (const [width, height] of [[0, 1], [1, 0]]) {
        it(`rejects zero cell dimensions ${width} x ${height}`, function () {
            const { ctx, endpointService } = arrange();
            endpointService.subscribe.calls[0][2]({ ...message, cellWidth: width, cellHeight: height });
            assert.strictEqual(ctx.data, undefined);
            assert.strictEqual(ctx.status.setError.calls.length, 1);
        });
    }
    it('stores stable message fields for drawing', function () {
        const { ctx, endpointService } = arrange();
        endpointService.subscribe.calls[0][2](message);
        assert.strictEqual(ctx.data.message, message);
        assert.equal(ctx.data.frameId, 'map');
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });
	it('uses the message timestamp only when enabled', function () {
		const { ctx, tf } = arrange();
		ctx.transformFor({ message, frameId: 'map' });
		assert.deepEqual(plain(tf.getAbsoluteTransform.calls[0][0]), { frameId: 'map' });
		ctx.timestampCheckbox.checked = true;
		ctx.transformFor({ message, frameId: 'map' });
		assert.deepEqual(plain(tf.getAbsoluteTransform.calls[1][0]), {
            frameId: 'map', stamp: { sec: 1, nanosec: 2 },
        });
    });
    it('clears old data when the required transform is absent', function () {
        const { ctx, endpointService, tf } = arrange();
        tf.getAbsoluteTransform = spy(() => undefined);
        endpointService.subscribe.calls[0][2](message);
        assert.strictEqual(ctx.data, undefined);
        assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

});
