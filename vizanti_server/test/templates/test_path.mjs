import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('path plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('path');
    });

    subscriptionCases('path', 'path_topic', 'nav_msgs/msg/Path');
    const point = (x, y, z) => ({ pose: { position: { x, y, z } } });
    for (const input of [undefined, null, {}, [], [point(1, 2, 3)]]) {
        it(`returns zero distance for ${JSON.stringify(input)}`, function () {
            const ctx = loadFunctions('path', ['getDistance']);
            assert.strictEqual(ctx.getDistance(input), 0);
        });
    }
    it('sums three-dimensional segment lengths', function () {
        const ctx = loadFunctions('path', ['getDistance']);
        assert.strictEqual(ctx.getDistance([point(0, 0, 0), point(3, 4, 0), point(3, 4, 12)]), 17);
    });
    it('skips incomplete pairs without bridging gaps', function () {
        const ctx = loadFunctions('path', ['getDistance']);
        assert.strictEqual(ctx.getDistance([point(0, 0, 0), {}, point(3, 4, 0)]), 0);
    });
    it('warns and preserves existing display data for a missing poses list', function () {
        const ctx = loadFunctions('path', ['connect'], environment({ path_topic: undefined, pose_array: ['old'], drawPath: spy() }));
        ctx.connect(); ctx.topics[0].emit({});
        assert.deepStrictEqual(ctx.pose_array, ['old']);
        assert.strictEqual(ctx.drawPath.calls.length, 0);
        assert.strictEqual(ctx.status.setWarn.calls.length, 2);
    });

});
