import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy } from './plugin_harness.mjs';

describe('simplegoal plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('simplegoal');
    });

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('simplegoal', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined, loadTopics: spy(), openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('opens the goal configuration modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.loadTopics.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });
});
