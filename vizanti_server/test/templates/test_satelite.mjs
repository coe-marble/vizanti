import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('satelite plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('satelite');
    });

    function arrange(messageMode, activeConfiguration) {
        const ctx = loadFunctions('satelite', ['updateGotoPointAvailability', 'clamp'], {
            gotoMessageMode: messageMode,
            gotoNavSatFixEndpointConfigurationEditor: { activeConfiguration },
            gotoPoseEndpointConfigurationEditor: { activeConfiguration },
            gotoPointAction: { classList: { toggle: spy() }, setAttribute: spy(), title: '' },
        });
        return { ctx };
    }

    it('disables Go To Point until its active endpoint is configured', function () {
        const { ctx } = arrange('navsatfix', null);
        ctx.updateGotoPointAvailability();
        assert.deepStrictEqual(ctx.gotoPointAction.classList.toggle.calls, [['menu-item-disabled', true]]);
        assert.deepStrictEqual(ctx.gotoPointAction.setAttribute.calls, [['aria-disabled', 'true']]);
    });

    it('enables a configured PoseStamped Go To endpoint and clamps tile bounds', function () {
        const { ctx } = arrange('pose_stamped', { endpoint: { topic: '/goto' } });
        ctx.updateGotoPointAvailability();
        assert.deepStrictEqual(ctx.gotoPointAction.classList.toggle.calls, [['menu-item-disabled', false]]);
        assert.deepStrictEqual(ctx.gotoPointAction.setAttribute.calls, [['aria-disabled', 'false']]);
        assert.strictEqual(ctx.clamp(-1, 0, 4), 0);
        assert.strictEqual(ctx.clamp(8, 0, 4), 4);
        assert.strictEqual(ctx.clamp(2, 0, 4), 2);
    });

    it('shows only the selected output configuration and accepts a zero fix', function () {
        const hidden = { style: {} };
        const visible = { style: {} };
        const ctx = loadFunctions('satelite', [
            'fixedPointHasValidData', 'updateGotoEndpointConfigurationVisibility',
            'updateGotoPointAvailability',
        ], {
            gotoMessageMode: 'pose_stamped',
            publishPoseStampedBox: { checked: false },
            gotoEndpointHeading: { innerText: '' },
            gotoNavSatFixEndpointConfigurationContainer: hidden,
            gotoPoseEndpointConfigurationContainer: visible,
            gotoNavSatFixEndpointConfigurationEditor: { activeConfiguration: null },
            gotoPoseEndpointConfigurationEditor: { activeConfiguration: { endpoint: { topic: '/goto_pose' } } },
            gotoPointAction: { classList: { toggle: spy() }, setAttribute: spy(), title: '' },
        });
        ctx.updateGotoEndpointConfigurationVisibility();
        assert.equal(ctx.publishPoseStampedBox.checked, true);
        assert.equal(ctx.gotoEndpointHeading.innerText, 'PoseStamped Output Configuration');
        assert.equal(ctx.gotoNavSatFixEndpointConfigurationContainer.style.display, 'none');
        assert.equal(ctx.gotoPoseEndpointConfigurationContainer.style.display, '');
        assert.equal(ctx.fixedPointHasValidData('map,0.0,0.0,0.0'), true);
        assert.equal(ctx.fixedPointHasValidData('   '), false);
    });

    it('shows the manual origin only when requested', function () {
        const ctx = loadFunctions('satelite', ['updateFixSourceVisibility'], {
            useManualFix: true,
            useManualFixBox: { checked: false },
            manualFixSection: { style: {} },
            navSatFixInputSection: { style: {} },
        });
        ctx.updateFixSourceVisibility();
        assert.equal(ctx.useManualFixBox.checked, true);
        assert.equal(ctx.manualFixSection.style.display, '');
        assert.equal(ctx.navSatFixInputSection.style.display, 'none');
    });

    it('publishes a PoseStamped Go To point in the active map frame', function () {
        const endpointService = { publish: spy() };
        const configuration = { endpoint: { topic: '/goto_pose' } };
        const createPoseStamped = spy(message => message);
        const ctx = loadFunctions('satelite', ['publishGotoPoint'], {
            gotoMessageMode: 'pose_stamped',
            gotoPoseEndpointConfigurationEditor: { activeConfiguration: configuration },
            gotoNavSatFixEndpointConfigurationEditor: { activeConfiguration: null },
            endpointService,
            guiMessages: { createPoseStamped },
            tf: { fixed_frame: 'map' },
            status: { setError: spy(), setOK: spy() },
        });
        ctx.publishGotoPoint({}, { x: 12, y: -3 });
        const message = plain(createPoseStamped.calls[0][0]);
        assert.equal(message.frameId, 'map');
        assert.deepStrictEqual(message.position, { x: 12, y: -3, z: 0 });
        assert.deepStrictEqual(message.orientation, { x: 0, y: 0, z: 0, w: 1 });
        assert.deepStrictEqual(endpointService.publish.calls[0][0], configuration);
    });
});
