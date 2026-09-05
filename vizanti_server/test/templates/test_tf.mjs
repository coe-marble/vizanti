import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('tf plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('tf');
    });

    it('projects an identity basis with translation and scale', function () {
        const ctx = loadFunctions('tf', ['getBasis'], { view: { fixedToScreen: p => p } });
        assert.deepStrictEqual(plain(ctx.getBasis({ w: 1, x: 0, y: 0, z: 0 }, { x: 3, y: 4 }, 2)),
            [{ x: 3, y: 4 }, { x: 5, y: 4 }, { x: 3, y: 6 }, { x: 3, y: 4 }, false]);
    });
    it('registers new frames while respecting an explicitly hidden frame', function () {
        const ctx = loadFunctions('tf', ['updateVisibility'], { visibleRelativeKeys: new Set(['stale']), visibleAbsoluteKeys: new Set(['stale']),
            frame_visibility: { child: false }, tf: { transforms: { child: { parent: 'map' } }, absoluteTransforms: { child: {}, map: {} } } });
        ctx.updateVisibility();
        assert.deepStrictEqual([...ctx.visibleRelativeKeys], ['map']);
        assert.deepStrictEqual([...ctx.visibleAbsoluteKeys], ['map']);
        assert.strictEqual(ctx.frame_visibility.map, true);
        assert.strictEqual(ctx.frame_visibility.child, false);
    });
    it('excludes frames without absolute transforms from the absolute draw set', function () {
        const ctx = loadFunctions('tf', ['updateVisibility'], { visibleRelativeKeys: new Set(), visibleAbsoluteKeys: new Set(), frame_visibility: {},
            tf: { transforms: { child: { parent: 'map' } }, absoluteTransforms: {} } });
        ctx.updateVisibility(); assert.strictEqual(ctx.visibleRelativeKeys.size, 2); assert.strictEqual(ctx.visibleAbsoluteKeys.size, 0);
    });

});
