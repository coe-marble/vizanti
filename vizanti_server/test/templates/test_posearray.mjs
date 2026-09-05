import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('posearray plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('posearray');
    });

    subscriptionCases('posearray', 'poses_topic', 'geometry_msgs/msg/PoseArray', () => ({ typedict: { '/test': 'geometry_msgs/msg/PoseArray' } }));
    for (const type of ['geometry_msgs/msg/PoseArray', 'nav2_msgs/msg/ParticleCloud']) {
        it(`transforms ${type} positions and yaw into renderable poses`, function () {
            const ctx = loadFunctions('posearray', ['connect'], environment({ poses_topic: undefined,
                typedict: { '/test': type }, poses: [], frame: '', drawArrows: spy(),
                tf: { fixed_frame: 'map', absoluteTransforms: { sensor: {} }, transformPoseStamped: spy(() => ({ translation: { x: 10, y: 20 }, rotation: { toEuler: () => ({ h: 0.5 }) } })) },
            }));
            ctx.connect();
            const pose = { position: { x: 1, y: 2, z: 0 }, orientation: { w: 1 } };
            ctx.topics[0].emit({ header: { frame_id: 'sensor' }, poses: [pose], particles: [{ pose }] });
            assert.deepStrictEqual(plain(ctx.poses), [{ x: 10, y: 20, yaw: 0.5 }]);
            assert.strictEqual(ctx.frame, 'map');
            assert.strictEqual(ctx.drawArrows.calls.length, 1);
        });
    }
    it('does not render poses without the required transform', function () {
        const ctx = loadFunctions('posearray', ['connect'], environment({ poses_topic: undefined, typedict: { '/test': 'geometry_msgs/msg/PoseArray' }, drawArrows: spy() }));
        ctx.connect(); ctx.topics[0].emit({ header: { frame_id: 'missing' }, poses: [] });
        assert.strictEqual(ctx.status.setError.calls.length, 1);
        assert.strictEqual(ctx.drawArrows.calls.length, 0);
    });

});
