import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, environment, plain, spy } from './plugin_harness.mjs';

describe('rosbag plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('rosbag');
    });

    it('updates controls and icon for active and inactive recording states', function () {
        const startButton = element(); const icon = element();
        const ctx = loadFunctions('rosbag', ['setState'], { startButton, icon, active: false });
        ctx.setState(true);
        assert.strictEqual(startButton.innerText, 'Stop recording');
        assert.strictEqual(icon.src, 'assets/rosbag_active.svg');
        assert.strictEqual(ctx.active, true);
        ctx.setState(false);
        assert.strictEqual(startButton.innerText, 'Start recording');
        assert.strictEqual(icon.src, 'assets/rosbag.svg');
        assert.strictEqual(ctx.active, false);
    });

    it('asks the adapter for recording status and applies it', async function () {
        const setState = (...args) => { setState.calls.push(args); }; setState.calls = [];
        const endpointService = { recordingStatus: spy(async () => ({ active: true })) };
        const adapterConfiguration = { adapterId: 'example', values: {} };
        const ctx = loadFunctions('rosbag', ['getRecordingStatus'], environment({
            setState, endpointService, adapterConfiguration,
        }));
        const pending = ctx.getRecordingStatus();
        assert.strictEqual(await pending, true);
        assert.deepStrictEqual(setState.calls, [[true]]);
        assert.deepStrictEqual(endpointService.recordingStatus.calls, [[adapterConfiguration]]);
    });

    it('passes the selected path unchanged to the recording adapter', async function () {
        const endpointService = { setRecording: spy(async () => ({ success: true })) };
        const adapterConfiguration = { adapterId: 'example', values: {} };
        const ctx = loadFunctions('rosbag', ['setRecording'], environment({
            endpointService, adapterConfiguration,
        }));
        await ctx.setRecording(['/scan'], true, '/tmp/recording');
        const [[configuration, request]] = endpointService.setRecording.calls;
        assert.deepStrictEqual(plain(configuration), adapterConfiguration);
        assert.deepStrictEqual(plain(request.topics), ['/scan']);
        assert.strictEqual(request.start, true);
        assert.strictEqual(request.path, '/tmp/recording');
    });
});
