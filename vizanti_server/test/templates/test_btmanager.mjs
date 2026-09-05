import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, spy } from './plugin_harness.mjs';

describe('btmanager plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('btmanager');
    });

    function arrange() {
        const scheduled = [];
        const panel = element();
        panel.hidden = true;
        const ctx = loadFunctions('btmanager', ['togglePanel', 'startLongPress', 'cancelLongPress'], {
            panel, isLongPress: false, longPressTimer: undefined, openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, panel, scheduled };
    }

    it('toggles the panel visibility for a normal click', function () {
        const { ctx, panel } = arrange();
        ctx.togglePanel();
        assert.strictEqual(panel.hidden, false);
        ctx.togglePanel();
        assert.strictEqual(panel.hidden, true);
    });

    it('opens the manager modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });
});
