import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, spy } from './plugin_harness.mjs';

describe('satelite plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('satelite');
    });

    function arrange(vehicle) {
        const status = { setError: spy() };
        const ctx = loadFunctions('satelite', ['updateGotoPointAvailability', 'resolveGotoTopic', 'clamp'], {
            vehicleSelectionModule: { getSelectedVehicle: () => vehicle },
            gotoPointAction: { classList: { toggle: spy() }, setAttribute: spy(), title: '' },
            status,
        });
        return { ctx, status };
    }

    it('disables Go To Point until a vehicle is selected', function () {
        const { ctx } = arrange(null);
        ctx.updateGotoPointAvailability();
        assert.deepStrictEqual(ctx.gotoPointAction.classList.toggle.calls, [['menu-item-disabled', true]]);
        assert.deepStrictEqual(ctx.gotoPointAction.setAttribute.calls, [['aria-disabled', 'true']]);
    });

    it('resolves a relative Go To Point topic under the selected vehicle namespace', function () {
        const { ctx } = arrange({ namespace: '/fleet/alpha/', gotoTopic: 'goto' });
        assert.strictEqual(ctx.resolveGotoTopic(), '/fleet/alpha/goto');
    });

    it('preserves an absolute Go To Point topic', function () {
        const { ctx } = arrange({ namespace: '/fleet/alpha', gotoTopic: '/goto' });
        assert.strictEqual(ctx.resolveGotoTopic(), '/goto');
    });

    it('reports missing vehicle configuration and clamps tile bounds', function () {
        const { ctx, status } = arrange(null);
        assert.strictEqual(ctx.resolveGotoTopic(), null);
        assert.strictEqual(status.setError.calls.length, 1);
        assert.strictEqual(ctx.clamp(-1, 0, 4), 0);
        assert.strictEqual(ctx.clamp(8, 0, 4), 4);
        assert.strictEqual(ctx.clamp(2, 0, 4), 2);
    });
});
