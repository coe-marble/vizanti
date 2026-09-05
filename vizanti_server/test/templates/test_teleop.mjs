import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy } from './plugin_harness.mjs';

describe('teleop plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('teleop');
    });

    function arrange(locked = false) {
        const scheduled = [];
        const ctx = loadFunctions('teleop', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined, joy_locked: locked,
            setLock: spy(), saveSettings: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('toggles the joystick lock and saves it after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange(false);
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
        assert.deepStrictEqual(ctx.setLock.calls, [[true]]);
        assert.strictEqual(ctx.saveSettings.calls.length, 1);
    });

    it('unlocks a locked joystick after a long press', function () {
        const { ctx, scheduled } = arrange(true);
        ctx.startLongPress();
        scheduled[0].callback();
        assert.deepStrictEqual(ctx.setLock.calls, [[false]]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });
});
