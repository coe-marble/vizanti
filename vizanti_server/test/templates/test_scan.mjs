import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('scan plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('scan');
    });

    const labels = () => Object.fromEntries(['angle', 'frame', 'angleinc', 'pointscount', 'scantime', 'min', 'max'].map(x => [`text_${x}`, element()]));
    subscriptionCases('scan', 'range_topic', 'sensor_msgs/msg/LaserScan', labels);
    function arrange() {
        const ctx = loadFunctions('scan', ['connect', 'radToDeg'], environment({ ...labels(), range_topic: undefined,
			data: undefined, drawScan: spy(), endpointService: { applyRotation: point => point },
            tf: { fixed_frame: 'map', getAbsoluteTransform: () => ({ rotation: {} }) },
        }));
        ctx.connect(); return ctx;
    }
    it('filters invalid ranges while retaining both inclusive range limits', function () {
        const ctx = arrange();
        ctx.topics[0].emit({ header: { frame_id: 'laser' }, ranges: [0, 1, 2, 3, Infinity, NaN], range_min: 1, range_max: 2,
            angle_min: 0, angle_max: 0, angle_increment: 0, scan_time: 0.1 });
        assert.deepStrictEqual(plain(ctx.data.points), [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]);
        assert.strictEqual(ctx.drawScan.calls.length, 1);
        assert.strictEqual(ctx.text_pointscount.innerText, 'Points: 6');
    });
    it('rejects scans when the transform is missing', function () {
        const ctx = arrange(); ctx.tf.getAbsoluteTransform = () => undefined;
        ctx.topics[0].emit({ header: { frame_id: 'missing' } });
        assert.strictEqual(ctx.status.setError.calls.length, 1);
        assert.strictEqual(ctx.drawScan.calls.length, 0);
    });
    it('falls back to the fixed frame for empty frame identifiers', function () {
        const ctx = arrange(); const msg = { header: { frame_id: '' }, ranges: [], range_min: 0, range_max: 2,
            angle_min: 0, angle_max: 0, angle_increment: 0, scan_time: 0.1 };
        ctx.topics[0].emit(msg);
        assert.strictEqual(msg.header.frame_id, 'map');
        assert.strictEqual(ctx.status.setWarn.calls.length, 2);
        assert.strictEqual(ctx.status.setOK.calls.length, 0);
    });

});
