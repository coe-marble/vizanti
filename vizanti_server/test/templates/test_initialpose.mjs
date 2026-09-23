import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('initialpose plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('initialpose');
    });

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('initialpose', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined,
            endpointConfigurationEditor: { refresh: spy() }, openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('refreshes endpoints and opens its modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        assert.strictEqual(scheduled[0].delay, 500);
        scheduled[0].callback();
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.endpointConfigurationEditor.refresh.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });

    it('publishes a stable pose-with-covariance message to the selected endpoint', function () {
        const configuration = { endpoint: { topic: '/initialpose' } };
        const endpointService = { publish: spy() };
        const createPoseWithCovariance = spy(message => message);
        const ctx = loadFunctions('initialpose', ['getEndpointConfiguration', 'sendMessage'], {
            endpointConfigurationEditor: { activeConfiguration: configuration },
            endpointService,
            guiMessages: { createPoseWithCovariance },
            Quaternion: { fromEuler: () => ({ x: 0, y: 0, z: 0, w: 1 }) },
            view: { screenToFixed: () => ({ x: 4, y: 5 }) },
            tf: { fixed_frame: 'map' },
            status: { setOK: spy(), setError: spy() },
        });

        ctx.sendMessage({ x: 10, y: 20 }, { x: 1, y: 0 });

        assert.strictEqual(endpointService.publish.calls[0][0], configuration);
        const message = plain(endpointService.publish.calls[0][1]);
        assert.equal(message.frameId, 'map');
        assert.deepEqual(message.position, { x: 4, y: 5, z: 0 });
        assert.equal(message.covariance.length, 36);
    });

    it('publishes a default forward heading when placement has no drag', function () {
        const sendMessage = spy();
        const ctx = loadFunctions('initialpose', ['endDrag'], {
            start_point: { x: 10, y: 20 }, delta: undefined, sendMessage,
            drawArrow: spy(), setActive: spy(),
        });
        ctx.endDrag();
		assert.deepStrictEqual(plain(sendMessage.calls), [[{ x: 10, y: 20 }, { x: -1, y: 0 }]]);
        assert.strictEqual(ctx.start_point, undefined);
        assert.strictEqual(ctx.delta, undefined);
        assert.deepStrictEqual(ctx.setActive.calls, [[false]]);
    });
});
