import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('robotmodel plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('robotmodel');
    });

    for (const [frame, expected] of [['/fleet/robot/base_link/', '/fleet/robot'], ['robot/base_footprint', '/robot'], ['robot/base', '/robot'], ['base_link', ''], ['robot/camera', ''], [null, '']]) {
        it(`derives namespace ${JSON.stringify(expected)} from frame ${JSON.stringify(frame)}`, function () {
            assert.strictEqual(loadFunctions('robotmodel', ['namespaceFromFrame']).namespaceFromFrame(frame), expected);
        });
    }
    for (const [input, expected] of [[' robot/ ', '/robot'], ['/fleet/robot/', '/fleet/robot'], ['/', ''], ['', '']]) {
        it(`normalizes configured namespace ${JSON.stringify(input)}`, function () {
            assert.strictEqual(loadFunctions('robotmodel', ['normalizedNamespace'], { namespaceSelector: element(input) }).normalizedNamespace(), expected);
        });
    }
    it('prefers base_link over footprint and other base frames', function () {
        const ctx = loadFunctions('robotmodel', ['find_base_frame'], { tf: { frame_list: new Set(['base', 'base_footprint', 'robot/base_link']) } });
        assert.strictEqual(ctx.find_base_frame(), 'robot/base_link');
    });
    it('falls back to base_link when no frame matches', function () {
        assert.strictEqual(loadFunctions('robotmodel', ['find_base_frame'], { tf: { frame_list: new Set(['camera']) } }).find_base_frame(), 'base_link');
    });

    function interactionContext(overrides = {}) {
        const icon = element();
        const selectVehicle = spy();
        const registerVehicle = spy();
        const openModal = spy();
        const scheduled = [];
        const ctx = loadFunctions('robotmodel', [
            'normalizedNamespace', 'getCurrentVehicle', 'selectCurrentVehicle',
            'registerCurrentVehicle', 'updateVehicleSelection', 'selectRobotOnMap',
            'startLongPress', 'cancelLongPress',
        ], {
            icon,
            robotName: element('AUV'),
            namespaceSelector: element('/fleet/alpha/'),
            gotoTopicSelector: element('goto'),
            pathTopicSelector: element('/path'),
            frame: 'alpha/base_link',
            selectVehicle,
            registerVehicle,
            openModal,
            drawRobot: spy(),
            setTimeout: (callback, delay) => {
                scheduled.push({ callback, delay });
                return scheduled.length;
            },
            clearTimeout: spy(),
            isLongPress: false,
            longPressTimer: undefined,
            ...overrides,
        });
        return { ctx, icon, selectVehicle, registerVehicle, openModal, scheduled };
    }

    it('builds the selected vehicle from the configured robot properties', function () {
        const { ctx } = interactionContext();
        assert.deepStrictEqual(plain(ctx.getCurrentVehicle()), {
            id: '{uniqueID}', name: 'AUV', namespace: '/fleet/alpha',
            gotoTopic: 'goto', pathTopic: '/path', frame: 'alpha/base_link',
        });
    });

    it('uses the robot frame as the vehicle name when no name is configured', function () {
        const { ctx } = interactionContext({ robotName: element('   ') });
        assert.strictEqual(ctx.getCurrentVehicle().name, 'alpha/base_link');
    });

    it('selects its configured vehicle', function () {
        const { ctx, selectVehicle } = interactionContext();
        ctx.selectCurrentVehicle();
        assert.deepStrictEqual(plain(selectVehicle.calls[0][0]), plain(ctx.getCurrentVehicle()));
    });

    it('registers its configured vehicle', function () {
        const { ctx, registerVehicle } = interactionContext();
        ctx.registerCurrentVehicle();
        assert.deepStrictEqual(plain(registerVehicle.calls[0][0]), plain(ctx.getCurrentVehicle()));
    });

    it('marks the icon selected when this vehicle is selected', function () {
        const { ctx, icon } = interactionContext();
        ctx.updateVehicleSelection({ detail: { id: '{uniqueID}', name: 'AUV', namespace: '/fleet/alpha' } });
        assert.strictEqual(icon.classList.contains('vehicle-selected'), true);
        assert.strictEqual(icon.style.backgroundColor, 'rgba(255, 255, 255, 1.0)');
        assert.strictEqual(icon.title, 'Selected vehicle: AUV (/fleet/alpha)');
    });

    it('clears the selected icon state when another vehicle is selected', function () {
        const { ctx, icon } = interactionContext();
        ctx.updateVehicleSelection({ detail: { id: 'other', name: 'Other', namespace: '' } });
        assert.strictEqual(icon.classList.contains('vehicle-selected'), false);
        assert.strictEqual(icon.style.backgroundColor, 'rgba(124, 124, 124, 0.3)');
        assert.strictEqual(icon.title, 'Select vehicle');
    });

    it('selects the robot when a primary pointer event lands inside its map hit area', function () {
        const { ctx, selectVehicle } = interactionContext({
            sprite: 'auv', length: 100,
            models: { auv: { naturalWidth: 100, naturalHeight: 100 } },
            tf: { absoluteTransforms: { 'alpha/base_link': { translation: { x: 10, y: 20 } } } },
            view: { getMapUnitsInPixels: () => 1, fixedToScreen: point => point },
        });
        ctx.selectRobotOnMap({ type: 'mousedown', button: 0, clientX: 55, clientY: 20 });
        assert.strictEqual(selectVehicle.calls.length, 1);
    });

    it('does not select the robot for a secondary click or a pointer outside its hit area', function () {
        const { ctx, selectVehicle } = interactionContext({
            sprite: 'auv', length: 100,
            models: { auv: { naturalWidth: 100, naturalHeight: 100 } },
            tf: { absoluteTransforms: { 'alpha/base_link': { translation: { x: 10, y: 20 } } } },
            view: { getMapUnitsInPixels: () => 1, fixedToScreen: point => point },
        });
        ctx.selectRobotOnMap({ type: 'mousedown', button: 2, clientX: 10, clientY: 20 });
        ctx.selectRobotOnMap({ type: 'mousedown', button: 0, clientX: 200, clientY: 20 });
        assert.strictEqual(selectVehicle.calls.length, 0);
    });

    it('opens the configuration modal after a 500 ms long press', function () {
        const { ctx, openModal, scheduled } = interactionContext();
        ctx.startLongPress();
        assert.strictEqual(scheduled[0].delay, 500);
        scheduled[0].callback();
        assert.strictEqual(ctx.isLongPress, true);
        assert.deepStrictEqual(openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = interactionContext();
        ctx.longPressTimer = 42;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[42]]);
    });

});
