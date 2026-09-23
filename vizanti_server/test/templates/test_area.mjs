import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('area plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('area');
    });

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('area', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined,
            endpointConfigurationEditor: { refresh: spy() }, openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('opens the endpoint configuration modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        assert.strictEqual(scheduled[0].delay, 500);
        scheduled[0].callback();
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.endpointConfigurationEditor.refresh.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels the scheduled long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });

    it('publishes the selected rectangle through its active endpoint', function () {
        const configuration = { endpoint: { topic: '/area' } };
        const polygon = { type: 'vizanti/Polygon' };
        const ctx = loadFunctions('area', ['getEndpointConfiguration', 'getStamp', 'sendMessage'], {
            endpointConfigurationEditor: { activeConfiguration: configuration },
            status: { setError: spy(), setOK: spy() },
            view: { screenToFixed: spy((point) => ({ x: point.x, y: point.y })) },
            tf: { fixed_frame: 'map' },
            guiMessages: { createPolygon: spy(() => polygon) },
            endpointService: { publish: spy() },
        });
        ctx.sendMessage({ x: 1, y: 2 }, { x: 4, y: 7 });
        assert.deepStrictEqual(plain(ctx.guiMessages.createPolygon.calls[0][0].points), [
            { x: 1, y: 2, z: 0 }, { x: 4, y: 2, z: 0 },
            { x: 4, y: 7, z: 0 }, { x: 1, y: 7, z: 0 },
        ]);
        assert.deepStrictEqual(ctx.endpointService.publish.calls, [[configuration, polygon]]);
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });
});
