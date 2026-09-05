import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy } from './plugin_harness.mjs';

describe('button plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('button');
    });

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('button', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined, loadTopics: spy(), connect: spy(), openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('refreshes topics, reconnects, and opens its modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.loadTopics.calls.length, 1);
        assert.strictEqual(ctx.connect.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });
});
