import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('gridcells plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('gridcells');
    });

    subscriptionCases('gridcells', 'range_topic', 'nav_msgs/msg/GridCells');
    function arrange() {
        const ctx = loadFunctions('gridcells', ['connect'], environment({ range_topic: undefined, data: { old: true }, drawCells: spy() }));
        ctx.connect();
        return ctx;
    }
    for (const cells of [undefined, []]) {
        it(`clears stale cells when receiving ${cells === undefined ? 'missing' : 'empty'} cell data`, function () {
            const ctx = arrange(); ctx.topics[0].emit({ cells });
            assert.strictEqual(ctx.data, undefined);
            assert.strictEqual(ctx.drawCells.calls.length, 1);
            assert.strictEqual(ctx.status.setWarn.calls.length, 2);
        });
    }
    for (const [width, height] of [[0, 1], [1, 0]]) {
        it(`rejects zero cell dimensions ${width} x ${height}`, function () {
            const ctx = arrange(); ctx.topics[0].emit({ cells: [{}], cell_width: width, cell_height: height });
            assert.strictEqual(ctx.data, undefined);
            assert.strictEqual(ctx.status.setError.calls.length, 1);
        });
    }
    it('stores the message and its transform for drawing', function () {
        const ctx = arrange(); const pose = { translation: { x: 1 } };
        ctx.tf.absoluteTransforms.map = pose;
        const msg = { cells: [{ x: 1, y: 2 }], cell_width: 1, cell_height: 2, header: { frame_id: 'map' } };
        ctx.topics[0].emit(msg);
        assert.strictEqual(ctx.data.pose, pose);
        assert.strictEqual(ctx.data.msg, msg);
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });
    it('clears old data when the required transform is absent', function () {
        const ctx = arrange();
        ctx.topics[0].emit({ cells: [{}], cell_width: 1, cell_height: 1, header: { frame_id: 'missing' } });
        assert.strictEqual(ctx.data, undefined);
        assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

});
