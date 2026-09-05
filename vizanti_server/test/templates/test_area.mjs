import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy } from './plugin_harness.mjs';

describe('area plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('area');
    });

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('area', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined, loadTopics: spy(), openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('opens the topic modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        assert.strictEqual(scheduled[0].delay, 500);
        scheduled[0].callback();
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.loadTopics.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels the scheduled long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });
});
