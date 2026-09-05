import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('map plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('map');
    });

    subscriptionCases('map', 'map_topic', 'nav_msgs/msg/OccupancyGrid', () => ({ worker_thread: {} }));
    it('transforms map origin and forwards the selected colour scheme to the worker', function () {
        const transformed = { translation: { x: 4 } };
        const transform = spy(() => transformed);
        const worker_thread = { postMessage: spy() };
        const ctx = loadFunctions('map', ['queueWorkerMsg'], { tf: { transformPoseStamped: transform }, worker_thread, colourSchemeBox: element('costmap'), new_map_data: undefined });
        const msg = { header: { frame_id: 'map' }, info: { origin: { position: { x: 1 }, orientation: { w: 1 } } } };
        ctx.queueWorkerMsg(msg);
        assert.deepStrictEqual(transform.calls[0], [msg.header, msg.info.origin.position, msg.info.origin.orientation]);
        assert.strictEqual(ctx.new_map_data, msg);
        assert.strictEqual(msg.pose, transformed);
        assert.deepStrictEqual(plain(worker_thread.postMessage.calls[0][0]), { map_msg: msg, colour_scheme: 'costmap' });
    });
    for (const [width, height] of [[0, 5], [5, 0]]) {
        it(`does not dispatch an empty ${width} x ${height} map`, function () {
            const ctx = loadFunctions('map', ['connect'], environment({ map_topic: undefined, worker_thread: {}, queueWorkerMsg: spy() }));
            ctx.connect(); ctx.topics[0].emit({ info: { width, height } });
            assert.strictEqual(ctx.queueWorkerMsg.calls.length, 0);
            assert.strictEqual(ctx.status.setWarn.calls[1][0], 'Received empty map.');
        });
    }
    it('rejects a map in an unknown non-map frame', function () {
        const ctx = loadFunctions('map', ['connect'], environment({ map_topic: undefined, worker_thread: {}, queueWorkerMsg: spy() }));
        ctx.connect(); ctx.topics[0].emit({ info: { width: 1, height: 1 }, header: { frame_id: 'missing' } });
        assert.strictEqual(ctx.status.setError.calls.length, 1);
        assert.strictEqual(ctx.queueWorkerMsg.calls.length, 0);
    });

});
