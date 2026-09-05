import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy, plain } from './plugin_harness.mjs';

describe('survey plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('survey');
    });

    function routeContext(checked, vehicle) {
        return loadFunctions('survey', ['getPublishTopic', 'getCCWPolygon', 'roundSpacing'], {
            useSelectedVehicleCheckbox: { checked }, selectedVehicleId: 'alpha', topic: '/survey',
            vehicleSelectionModule: { getRegisteredVehicles: () => vehicle ? [vehicle] : [] },
            status: { setError: spy() },
        });
    }

    it('uses the configured topic when vehicle targeting is disabled', function () {
        assert.strictEqual(routeContext(false).getPublishTopic(), '/survey');
    });

    it('routes a selected vehicle path topic through its namespace', function () {
        const ctx = routeContext(true, { id: 'alpha', namespace: 'fleet/alpha', pathTopic: 'survey_path' });
        assert.strictEqual(ctx.getPublishTopic(), '/fleet/alpha/survey_path');
    });

    it('reports missing selected-vehicle path configuration', function () {
        const ctx = routeContext(true);
        assert.strictEqual(ctx.getPublishTopic(), null);
        assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

    it('converts a clockwise polygon to counter-clockwise order for survey geometry', function () {
        const ctx = routeContext(false);
        const clockwise = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
        assert.deepStrictEqual(plain(ctx.getCCWPolygon(clockwise)), [clockwise[2], clockwise[1], clockwise[0]]);
    });

    it('rounds survey spacing according to its display precision', function () {
        const ctx = routeContext(false);
        assert.strictEqual(ctx.roundSpacing(1.234), 1.23);
        assert.strictEqual(ctx.roundSpacing(12.34), 12.3);
        assert.strictEqual(ctx.roundSpacing(123.4), 123);
    });
});
