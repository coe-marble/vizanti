import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('compressedimage plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('compressedimage');
    });

    const setup = () => ({ resetLiveData: spy(), canvas: element(), stock_images: { loading: 'loading' },
        displayImageOffset: spy(), img_offset_x: 0, img_offset_y: 0 });
    subscriptionCases('compressedimage', 'image_topic', 'sensor_msgs/msg/CompressedImage', setup);
    it('preserves a rosbridge base64 payload without re-encoding', function () {
        const ctx = loadFunctions('compressedimage', ['getBase64ImageData'], environment({ isRWSFormat: null }));
        assert.strictEqual(ctx.getBase64ImageData({ data: 'aGVsbG8=' }), 'aGVsbG8=');
        assert.strictEqual(ctx.isRWSFormat, false);
    });
    it('converts binary transport data through the browser byte-array API', function () {
        class Bytes extends Uint8Array {
            toBase64() { return Buffer.from(this).toString('base64'); }
        }
        const ctx = loadFunctions('compressedimage', ['getBase64ImageData'], environment({ isRWSFormat: null, Uint8Array: Bytes }));
        assert.strictEqual(ctx.getBase64ImageData({ data: [104, 105] }), 'aGk=');
        assert.strictEqual(ctx.isRWSFormat, true);
    });
    it('strips the compressed-depth prefix before requesting a PNG image', async function () {
        const getImage = spy(() => Promise.resolve({}));
        const ctx = loadFunctions('compressedimage', ['connect', 'getBase64ImageData'], environment({ ...setup(), image_topic: undefined,
            isRWSFormat: null, getImage, updateLiveData: spy() }));
        ctx.connect();
        await ctx.topics[0].emit({ format: '16UC1; compressedDepth png', data: 'prefixiVBORw0KGgoDATA' });
        assert.strictEqual(getImage.calls[0][0], 'data:image/png;base64,iVBORw0KGgoDATA');
        assert.strictEqual(ctx.canvas.src, 'data:image/png;base64,iVBORw0KGgoDATA');
    });

});
