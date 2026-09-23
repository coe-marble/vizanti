import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, plain, spy } from './plugin_harness.mjs';

describe('compressedimage plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('compressedimage');
    });

    it('bounds custom image dimensions to a safe pixel range', function () {
        const ctx = loadFunctions('compressedimage', ['validCustomSize'], {
            clamp: (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum),
        });
        assert.strictEqual(ctx.validCustomSize('200', 400), 200);
        assert.strictEqual(ctx.validCustomSize('0', 400), 1);
        assert.strictEqual(ctx.validCustomSize('9999', 400), 4096);
        assert.strictEqual(ctx.validCustomSize('invalid', 400), 400);
    });

    const setup = () => ({ resetLiveData: spy(), canvas: element(), stock_images: { loading: 'loading' },
        displayImageOffset: spy(), img_offset_x: 0, img_offset_y: 0, throttle: element('500') });

    function arrange(configuration = { endpoint: { topic: '/image' } }, overrides = {}) {
        const subscription = { unsubscribe: spy() };
        const endpointService = { subscribe: spy(() => subscription) };
        const ctx = loadFunctions('compressedimage', ['getEndpointConfiguration', 'deliveryOptions', 'connect'], environment({
            ...setup(), ...overrides, subscription: undefined, endpointService,
            endpointConfigurationEditor: { activeConfiguration: configuration }, endpointMessageType: 'vizanti/Image',
        }));
        ctx.connect();
        return ctx;
    }

    it('requires a configured endpoint before subscribing', function () {
        const ctx = arrange(null);
        assert.strictEqual(ctx.endpointService.subscribe.calls.length, 0);
        assert.strictEqual(ctx.status.setError.calls[0][0], 'Select a configured endpoint.');
    });

    it('subscribes through the endpoint service with generic delivery options', function () {
        const ctx = arrange();
        assert.strictEqual(ctx.endpointService.subscribe.calls[0][0].endpoint.topic, '/image');
        assert.strictEqual(ctx.endpointService.subscribe.calls[0][1], 'vizanti/Image');
        assert.deepStrictEqual(plain(ctx.endpointService.subscribe.calls[0][3]), { throttleRate: 500, queueLength: 1 });
        assert.strictEqual(ctx.status.setWarn.calls[0][0], 'No data received.');

        ctx.connect();
        assert.strictEqual(ctx.subscription.unsubscribe.calls.length, 1);
        assert.strictEqual(ctx.endpointService.subscribe.calls.length, 2);
    });

    it('renders normalized adapter image data without ROS format handling', async function () {
        const getImage = spy(() => Promise.resolve({}));
        const updateLiveData = spy();
        const ctx = arrange(undefined, { getImage, updateLiveData });
        ctx.endpointService.subscribe.calls[0][2]({
            mimeType: 'image/png', base64Data: 'iVBORw0KGgoDATA', frameId: 'camera',
            encoding: '16uc1', compression: 'png', isDepth: true,
        });
        await Promise.resolve();
        assert.strictEqual(getImage.calls[0][0], 'data:image/png;base64,iVBORw0KGgoDATA');
        assert.strictEqual(ctx.canvas.src, 'data:image/png;base64,iVBORw0KGgoDATA');
        assert.strictEqual(updateLiveData.calls.length, 1);
    });

});
