import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('markerarray plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('markerarray');
    });

    subscriptionCases(
        'markerarray',
        'marker_topic',
        'visualization_msgs/msg/MarkerArray',
        () => ({ updateNamespaceGUI: spy() })
    );
    it('defaults absent marker colour to white', function () {
        assert.strictEqual(loadFunctions('markerarray', ['rgbaToFillColor']).rgbaToFillColor(), 'white');
    });
    it('clamps colour channels and alpha to their valid bounds', function () {
        const ctx = loadFunctions('markerarray', ['rgbaToFillColor']);
        assert.strictEqual(ctx.rgbaToFillColor({ r: -1, g: 2, b: 0.5, a: 3 }), 'rgba(0, 255, 128, 1)');
        assert.strictEqual(ctx.rgbaToFillColor({ r: 1, g: 0, b: 0, a: -1 }), 'rgba(255, 0, 0, 0)');
    });
    it('uses dark text on light markers and light text on dark markers', function () {
        const ctx = loadFunctions('markerarray', ['getContrastingColor']);
        assert.strictEqual(ctx.getContrastingColor({ r: 1, g: 1, b: 1 }), '#161B21');
        assert.strictEqual(ctx.getContrastingColor({ r: 0, g: 0, b: 0 }), '#FFFFFF');
    });

});
