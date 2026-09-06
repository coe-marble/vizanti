import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('range plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('range');
    });

    subscriptionCases('range', 'range_topic', 'sensor_msgs/msg/Range');
    function arrange() {
        const env = environment({ range_topic: undefined, data: {}, drawRanges: spy(),
			RADIATION_TYPE: ['ULTRASOUND', 'INFRARED'], endpointService: { applyRotation: point => point },
            tf: { fixed_frame: 'map', getAbsoluteTransform: () => ({ rotation: {} }) },
        });
        for (const key of ['range', 'min', 'max', 'fov', 'type']) env[`text_${key}`] = element();
        const ctx = loadFunctions('range', ['connect'], env); ctx.connect(); return ctx;
    }
    it('projects a forward-facing range cone and formats its readings', function () {
        const ctx = arrange();
        ctx.topics[0].emit({ header: { frame_id: 'sensor' }, range: 2, min_range: 0.1, max_range: 4, field_of_view: Math.PI / 2, radiation_type: 1 });
        assert.strictEqual(ctx.data.sensor.range, 2);
        assert.strictEqual(ctx.data.sensor.yaw, 0);
        assert.ok(Math.abs(ctx.data.sensor.field_of_view - Math.PI / 2) < 1e-12);
        assert.strictEqual(ctx.text_range.innerText, 'Range: 2.000 m');
        assert.strictEqual(ctx.text_type.innerText, 'Type: INFRARED');
        assert.strictEqual(ctx.drawRanges.calls.length, 1);
    });
    it('rejects a reading without a transform', function () {
        const ctx = arrange(); ctx.tf.getAbsoluteTransform = () => undefined;
        ctx.topics[0].emit({ header: { frame_id: 'missing' } });
        assert.strictEqual(ctx.drawRanges.calls.length, 0);
        assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

});
