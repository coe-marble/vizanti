import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('reconfigure plugin services', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('reconfigure');
    });

    it('requests parameters through the configured adapter', async function () {
        const adapterConfiguration = { adapterId: 'ros2', values: { namespace: '' } };
        const endpointService = { getNodeParameters: spy(() => Promise.resolve([['speed', 2, 2]])) };
        const ctx = loadFunctions('reconfigure', ['getNodeParameters'], { endpointService, adapterConfiguration });
        const pending = ctx.getNodeParameters('/node');
        assert.deepStrictEqual(endpointService.getNodeParameters.calls, [[adapterConfiguration, '/node']]);
        assert.deepStrictEqual(plain(await pending), [['speed', 2, 2]]);
    });

    it('updates parameters through the configured adapter', async function () {
        const adapterConfiguration = { adapterId: 'ros2', values: { namespace: '' } };
        const endpointService = { setNodeParameter: spy(() => Promise.resolve({ success: true })) };
        const ctx = loadFunctions('reconfigure', ['setNodeParameter'], { endpointService, adapterConfiguration });
        const pending = ctx.setNodeParameter('/node', 'speed', 2.5);
        assert.deepStrictEqual(endpointService.setNodeParameter.calls, [[adapterConfiguration, '/node', 'speed', 2.5]]);
        assert.deepStrictEqual(plain(await pending), { success: true });
    });
});
