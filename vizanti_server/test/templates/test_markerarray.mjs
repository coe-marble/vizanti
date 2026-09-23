import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, spy, plain } from './plugin_harness.mjs';

describe('markerarray plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('markerarray');
    });

    function arrange(configuration = { endpoint: { topic: '/markers' } }) {
        const createdSubscriptions = [];
        const endpointService = {
            subscribe: spy(() => {
                const subscription = { unsubscribe: spy() };
                createdSubscriptions.push(subscription);
                return subscription;
            }),
        };
        const ctx = loadFunctions(
            'markerarray', ['getEndpointConfiguration', 'deliveryThrottleRate', 'connect'],
            environment({
                endpointConfigurationEditor: { activeConfiguration: configuration },
                endpointService,
                endpointMessageType: 'vizanti/MarkerArray',
                subscription: undefined,
                markers: {}, z_sorted_keys: [], updateNamespaceGUI: spy(), drawMarkers: spy(),
            }),
        );
        return { ctx, endpointService, createdSubscriptions };
    }

    it('subscribes through the selected endpoint with delivery preferences', function () {
        const { ctx, endpointService } = arrange();
        ctx.connect();

        const [configuration, messageType, callback, deliveryOptions] = endpointService.subscribe.calls[0];
        assert.deepEqual(plain(configuration), { endpoint: { topic: '/markers' } });
        assert.equal(messageType, 'vizanti/MarkerArray');
        assert.equal(typeof callback, 'function');
        assert.deepEqual(plain(deliveryOptions), { throttleRate: 100, queueLength: 1 });
        assert.deepEqual(ctx.status.setWarn.calls, [['No data received.']]);
        assert.equal(ctx.saveSettings.calls.length, 1);
    });

    it('unsubscribes before creating a replacement endpoint subscription', function () {
        const { ctx, endpointService, createdSubscriptions } = arrange();
        ctx.connect();
        ctx.connect();

        assert.equal(createdSubscriptions[0].unsubscribe.calls.length, 1);
        assert.equal(endpointService.subscribe.calls.length, 2);
    });

    it('requires a configured endpoint before subscribing', function () {
        const { ctx, endpointService } = arrange(null);
        ctx.connect();

        assert.equal(endpointService.subscribe.calls.length, 0);
        assert.deepEqual(ctx.status.setError.calls, [['Select a configured endpoint.']]);
    });
    it('defaults absent marker colour to white', function () {
        assert.strictEqual(loadFunctions('markerarray', ['rgbaToFillColor']).rgbaToFillColor(), 'white');
    });
    it('clamps colour channels and alpha to their valid bounds', function () {
        const ctx = loadFunctions('markerarray', ['rgbaToFillColor']);
        assert.strictEqual(ctx.rgbaToFillColor({ r: -1, g: 2, b: 0.5, a: 3 }), 'rgba(0, 255, 128, 1)');
        assert.strictEqual(ctx.rgbaToFillColor({ r: 1, g: 0, b: 0, a: -1 }), 'rgba(255, 0, 0, 0)');
    });
    it('uses dark text on light markers and light text on dark markers', function () {
        const ctx = loadFunctions('markerarray', ['getContrastingColor']);
        assert.strictEqual(ctx.getContrastingColor({ r: 1, g: 1, b: 1 }), '#161B21');
        assert.strictEqual(ctx.getContrastingColor({ r: 0, g: 0, b: 0 }), '#FFFFFF');
    });

});
