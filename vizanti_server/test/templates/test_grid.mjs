import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('grid plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('grid');
    });

    for (const [input, expected] of [[1, 1], [1.49, 1], [1.5, 2], [3.49, 2], [3.5, 5], [7.49, 5], [7.5, 10], [0.02, 0.02], [350, 500]]) {
        it(`rounds grid scale ${input} to ${expected}`, function () {
            assert.strictEqual(loadFunctions('grid', ['calculateScale']).calculateScale(input), expected);
        });
    }
    it('inverts a translated, scaled screen matrix to local bounds', function () {
        const ctx = loadFunctions('grid', ['getLocalBounds']);
        assert.deepStrictEqual(plain(ctx.getLocalBounds({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 }, 100, 80)), { umin: -5, umax: 45, vmin: -10, vmax: 30 });
    });
    it('handles rotated screen coordinates', function () {
        const bounds = loadFunctions('grid', ['getLocalBounds']).getLocalBounds({ a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }, 100, 80);
        assert.deepStrictEqual(plain(bounds), { umin: 0, umax: 80, vmin: -100, vmax: 0 });
    });

});
