import assert from 'assert';
import fs from 'fs';
import { runTemplateContract } from './template_test_helpers.mjs';
import { element, loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('simplegoal plugin interactions', function () {
	it('preserves required template assets and placeholders', function () {
		runTemplateContract('simplegoal');
	});

	it('parses as an injected async widget script', function () {
		const source = fs.readFileSync(new URL('../../public/templates/simplegoal/simplegoal_script.js', import.meta.url), 'utf8');
		assert.doesNotThrow(() => new (Object.getPrototypeOf(async function () {}).constructor)(source));
	});

    function arrange() {
        const scheduled = [];
        const ctx = loadFunctions('simplegoal', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined,
            discoverTopics: spy(), openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('opens the goal configuration modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrange();
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
		assert.strictEqual(ctx.discoverTopics.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

	it('cancels a pending long press', function () {
        const { ctx } = arrange();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });

	it('uses the active Robot Model Pose endpoint choice', function () {
		const robotEndpointConfiguration = {
			endpointType: 'topic',
			outputMessageId: 'geometry_msgs/msg/PoseStamped',
			endpointId: '/alpha/goal_pose',
			endpoint: { topic: '/alpha/goal_pose', nativeMessageType: 'geometry_msgs/msg/PoseStamped' },
		};
		const ctx = loadFunctions('simplegoal', ['getEndpointConfiguration'], {
			endpointConfigurationEditor: { activeConfiguration: robotEndpointConfiguration },
			status: { setError: spy() },
		});
		assert.deepStrictEqual(plain(ctx.getEndpointConfiguration()), robotEndpointConfiguration);
	});

	it('reports topic discovery while refreshing the endpoint configuration', async function () {
		const discoveryStatus = element();
		const endpointConfigurationEditor = {
			refresh: spy(() => {
				assert.equal(discoveryStatus.textContent, 'Topics: fetching...');
				return Promise.resolve();
			}),
		};
		const ctx = loadFunctions('simplegoal', ['discoverTopics'], {
			discoveryStatus,
			endpointConfigurationEditor,
		});
		await ctx.discoverTopics();
		assert.equal(endpointConfigurationEditor.refresh.calls.length, 1);
		assert.equal(discoveryStatus.textContent, 'Topics: fetched.');
	});

	it('activates and deactivates goal placement without robot state', function () {
		const ctx = loadFunctions('simplegoal', ['setActive'], {
			goalActive: false,
			view: { setInputMovementEnabled: spy() },
			addListeners: spy(),
			removeListeners: spy(),
			icon: { style: {} },
			view_container: { style: {} },
		});
		ctx.setActive(true);
		assert.equal(ctx.goalActive, true);
		assert.deepStrictEqual(ctx.view.setInputMovementEnabled.calls[0], [false]);
		assert.equal(ctx.addListeners.calls.length, 1);
		assert.equal(ctx.icon.style.backgroundColor, 'rgba(255, 255, 255, 1.0)');

		ctx.setActive(false);
		assert.deepStrictEqual(ctx.view.setInputMovementEnabled.calls[1], [true]);
		assert.equal(ctx.removeListeners.calls.length, 1);
	});

	it('publishes a zero-yaw pose when the goal is clicked without dragging', function () {
		const quaternion = { x: 0, y: 0, z: 0, w: 1 };
		const pose = { type: 'vizanti/Pose' };
		const ctx = loadFunctions('simplegoal', ['sendMessage'], {
			status: { setError: spy(), setOK: spy() },
			getEndpointConfiguration: () => ({ endpoint: { topic: '/goal' } }),
			Quaternion: { fromEuler: spy(() => quaternion) },
			view: { screenToFixed: spy(() => ({ x: 4, y: 7 })) },
			tf: { fixed_frame: 'map' },
			guiMessages: { createPose: spy(() => pose) },
			endpointService: { publish: spy() },
		});
		ctx.sendMessage({ x: 10, y: 20 }, null);
		assert.deepStrictEqual(ctx.Quaternion.fromEuler.calls[0], [0, 0, 0, 'ZXY']);
		assert.deepStrictEqual(ctx.endpointService.publish.calls[0], [
			{ endpoint: { topic: '/goal' } }, pose,
		]);
		assert.equal(ctx.status.setError.calls.length, 0);
	});
});
