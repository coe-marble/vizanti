import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('odom plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('odom');
    });

    function arrange() {
        return loadFunctions('odom', ['appendPose'], { sample_array: [], historypicker: element('2'), time_since_updated: 0,
            Date: { now: () => 4000 }, updateTextDisplay: spy(), save_history: { checked: true }, savePoints: spy() });
    }
    const pose = x => ({ translation: { x, y: 0 }, rotation: { toEuler: () => ({ h: 0.5 }) } });
    it('stores the first pose and yaw and saves enabled history', function () {
        const ctx = arrange(); assert.strictEqual(ctx.appendPose(pose(1)), true);
        assert.deepStrictEqual(plain(ctx.sample_array), [{ x: 1, y: 0, yaw: 0.5 }]);
        assert.strictEqual(ctx.savePoints.calls.length, 1);
    });
    it('ignores displacement at or below the 3 cm threshold', function () {
        const ctx = arrange(); ctx.appendPose(pose(0));
        assert.strictEqual(ctx.appendPose(pose(0.03)), false);
        assert.strictEqual(ctx.sample_array.length, 1);
    });
    it('evicts the oldest pose at the configured history limit', function () {
        const ctx = arrange(); [0, 1, 2].forEach(x => ctx.appendPose(pose(x)));
        assert.deepStrictEqual(plain(ctx.sample_array.map(p => p.x)), [1, 2]);
    });
    it('does not persist history when saving is disabled', function () {
        const ctx = arrange(); ctx.save_history.checked = false; ctx.appendPose(pose(1));
        assert.strictEqual(ctx.savePoints.calls.length, 0);
    });
    it('does not subscribe in transform mode', function () {
        const ctx = loadFunctions('odom', ['connect'], environment({ odom_topic: undefined, mode: 'tf' }));
        ctx.connect(); assert.strictEqual(ctx.topics.length, 0);
    });

});
