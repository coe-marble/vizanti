import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('navball plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('navball');
    });

    it('unsubscribes from IMU data when switching to transform mode', function () {
        const imu_topic = { unsubscribe: spy() }; const listener = () => {};
        const ctx = loadFunctions('navball', ['connect'], environment({ imu_topic, listener, mode: 'tf' }));
        ctx.connect(); assert.deepStrictEqual(imu_topic.unsubscribe.calls, [[listener]]);
        assert.strictEqual(ctx.topics.length, 0);
    });
    it('rejects an empty IMU topic', function () {
        const ctx = loadFunctions('navball', ['connect'], environment({ imu_topic: undefined, mode: 'topic', topic: '' }));
        ctx.connect(); assert.strictEqual(ctx.topics.length, 0); assert.strictEqual(ctx.status.setError.calls[0][0], 'Empty topic.');
    });
    it('accepts a normalized IMU quaternion and updates displayed acceleration', function () {
        class Quaternion {
            constructor(values) {
                const v = Array.isArray(values) ? values : [1, 0, 0, 0];
                [this.w, this.x, this.y, this.z] = v;
            }
        }
        const env = environment({ imu_topic: undefined, mode: 'topic', raw_target: '/imu', Quaternion, quat: undefined, updateData: spy() });
        for (const name of ['frame_id', 'quaternion', 'accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z']) env[`text_${name}`] = element();
        const ctx = loadFunctions('navball', ['connect'], env); ctx.connect();
        ctx.topics[0].emit({ header: { frame_id: 'imu' }, orientation: { w: 1, x: 0, y: 0, z: 0 }, linear_acceleration: { x: 1, y: 2, z: 3 }, angular_velocity: { x: 0, y: 0, z: 0 } });
        assert.strictEqual(ctx.topics[0].options.name, '/imu');
        assert.strictEqual(ctx.topics[0].options.messageType, 'sensor_msgs/msg/Imu');
        assert.strictEqual(ctx.quat.w, 1);
        assert.strictEqual(ctx.text_accel_z.innerText, 'Z: 3');
        assert.strictEqual(ctx.updateData.calls.length, 1);
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });

});
