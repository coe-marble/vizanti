import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, environment, plain } from './plugin_harness.mjs';

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

    it('asks the status service and applies its success state', async function () {
        const setState = (...args) => { setState.calls.push(args); }; setState.calls = [];
        const ctx = loadFunctions('rosbag', ['getRecordingStatus'], environment({ setState }));
        const pending = ctx.getRecordingStatus(['/scan'], true, '/tmp/bag');
        const service = ctx.services[0];
        assert.strictEqual(service.options.name, '/vizanti/bag/status');
        assert.deepStrictEqual(plain(service.request), { topics: ['/scan'], start: true, path: '/tmp/bag' });
        service.resolve({ success: true });
        assert.strictEqual(await pending, true);
        assert.deepStrictEqual(setState.calls, [[true]]);
    });
});
