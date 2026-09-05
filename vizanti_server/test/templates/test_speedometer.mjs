import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('speedometer plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('speedometer');
    });

    for (const [unit, expected] of [['m/s', '1.00'], ['km/h', '3.60'], ['kts', '1.94'], ['mph', '2.24'], ['ft/s', '3.28'], ['b/s', '6.56']]) {
        it(`converts speed to ${unit}`, function () {
            const env = { units: unit };
            for (const key of ['unit', 'spd', 'spd_min', 'spd_max', 'dial']) env[`text_${key}`] = element();
            const ctx = loadFunctions('speedometer', ['writeText'], env); ctx.writeText(1, 0, 2);
            assert.strictEqual(ctx.text_spd.innerText, `Speed: ${expected} ${unit}`);
            assert.strictEqual(ctx.text_unit.innerText, unit);
        });
    }
    it('resets speed samples and extrema', function () {
        const ctx = loadFunctions('speedometer', ['resetTracking'], { speed_samples: [1, 2], min_speed: 1, max_speed: 2 });
        ctx.resetTracking();
        assert.deepStrictEqual(plain(ctx.speed_samples), []);
        assert.strictEqual(ctx.min_speed, Infinity); assert.strictEqual(ctx.max_speed, 0);
    });
    it('reports a missing tracked frame before attempting a speed calculation', function () {
        const ctx = loadFunctions('speedometer', ['calculateSpeed'], environment({ base_link_frame: 'base_link', fixed_frame: 'map' }));
        ctx.calculateSpeed(); assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

});
