import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, spy, plain } from './plugin_harness.mjs';

describe('waypoints plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('waypoints');
    });

    function routeContext(checked, vehicle) {
        return loadFunctions('waypoints', ['getPublishTopic', 'distancePointToLineSegment'], {
            useSelectedVehicleCheckbox: { checked }, selectedVehicleId: 'alpha', topic: '/path',
            vehicleSelectionModule: { getRegisteredVehicles: () => vehicle ? [vehicle] : [] },
            status: { setError: spy() },
        });
    }

    it('uses the configured topic when vehicle targeting is disabled', function () {
        assert.strictEqual(routeContext(false).getPublishTopic(), '/path');
    });

    it('routes a relative path topic through the selected vehicle namespace', function () {
        const ctx = routeContext(true, { id: 'alpha', namespace: '/fleet/alpha/', pathTopic: 'mission' });
        assert.strictEqual(ctx.getPublishTopic(), '/fleet/alpha/mission');
    });

    it('preserves an absolute selected-vehicle path topic', function () {
        const ctx = routeContext(true, { id: 'alpha', namespace: '/fleet/alpha', pathTopic: '/mission' });
        assert.strictEqual(ctx.getPublishTopic(), '/mission');
    });

    it('rejects vehicle targeting without a selected path topic', function () {
        const ctx = routeContext(true);
        assert.strictEqual(ctx.getPublishTopic(), null);
        assert.strictEqual(ctx.status.setError.calls.length, 1);
    });

    it('uses the closest point on a finite line segment during drag hit testing', function () {
        const ctx = routeContext(false);
        assert.strictEqual(ctx.distancePointToLineSegment(2, 3, 0, 0, 4, 0), 3);
        assert.strictEqual(ctx.distancePointToLineSegment(-2, 0, 0, 0, 4, 0), 2);
        assert.strictEqual(ctx.distancePointToLineSegment(6, 0, 0, 0, 4, 0), 2);
    });
});
