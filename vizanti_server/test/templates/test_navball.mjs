import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, plain, spy } from './plugin_harness.mjs';

describe('navball plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('navball');
    });

    function sourceTextElements() {
        return Object.fromEntries([
            'accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z',
        ].map(name => [`text_${name}`, element()]));
    }

    function loadConnect(overrides = {}) {
        return loadFunctions('navball', [
            'activeEndpointConfiguration', 'deliveryOptions', 'timestampSeconds',
            'disconnect', 'clearImuData', 'connect',
        ], {
            endpointConfigurationEditor: { activeConfiguration: null },
            endpointService: { getTf: spy(), subscribe: spy() },
            endpointMessageType: 'vizanti/Imu', imuSubscription: undefined,
            sourceMode: 'imu', throttle: element('30'), status: { setOK: spy(), setWarn: spy(), setError: spy() },
            Quaternion: class Quaternion {}, saveSettings: spy(),
            ...sourceTextElements(),
            ...overrides,
        });
    }

    it('unsubscribes from IMU data when switching to TF mode', function () {
        const imuSubscription = { unsubscribe: spy() };
        const ctx = loadConnect({ sourceMode: 'tf', imuSubscription });
        ctx.connect();
        assert.deepStrictEqual(imuSubscription.unsubscribe.calls, [[]]);
        assert.strictEqual(ctx.imuSubscription, undefined);
    });

    it('rejects an empty IMU topic', function () {
        const ctx = loadConnect();
        ctx.connect();
        assert.strictEqual(ctx.endpointService.subscribe.calls.length, 0);
        assert.strictEqual(ctx.status.setError.calls[0][0], 'Select a configured endpoint.');
    });

    it('accepts a normalized IMU quaternion and updates displayed acceleration', function () {
        class Quaternion {
            constructor(values) {
                const v = Array.isArray(values) ? values : [1, 0, 0, 0];
                [this.w, this.x, this.y, this.z] = v;
            }
        }
        const configuration = { adapterId: 'ros2', endpoint: { topic: '/imu' } };
        const subscription = { unsubscribe: spy() };
        const updateData = spy();
        const endpointService = {
            getTf: spy(() => ({ frame_list: new Set(), absoluteTransforms: {} })),
            subscribe: spy(() => subscription),
        };
        const ctx = loadConnect({
            endpointConfigurationEditor: { activeConfiguration: configuration }, endpointService,
            Quaternion, updateData, quat: undefined,
            text_frame_id: element(), text_quaternion: element(),
        });
        ctx.connect();
        const [, messageType, onMessage, delivery] = endpointService.subscribe.calls[0];
        assert.strictEqual(messageType, 'vizanti/Imu');
        assert.deepStrictEqual(plain(delivery), { throttleRate: 30, queueLength: 1 });
        onMessage({
            frameId: 'imu', stamp: { sec: 1, nanosec: 0 },
            orientation: { w: 1, x: 0, y: 0, z: 0 },
            linearAcceleration: { x: 1, y: 2, z: 3 },
            angularVelocity: { x: 0, y: 0, z: 0 },
        });
        assert.strictEqual(ctx.quat.w, 1);
        assert.strictEqual(ctx.text_accel_z.innerText, 'Z: 3');
        assert.strictEqual(ctx.updateData.calls.length, 1);
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });

});
