import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, plain } from './plugin_harness.mjs';

describe('reconfigure plugin services', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('reconfigure');
    });

    it('parses parameters returned by the node-parameter service', async function () {
        const ctx = loadFunctions('reconfigure', ['getNodeParameters'], environment());
        const pending = ctx.getNodeParameters('/node');
        const service = ctx.services[0];
        assert.strictEqual(service.options.name, '/vizanti/get_node_parameters');
        assert.deepStrictEqual(plain(service.request), { node: '/node' });
        service.resolve({ parameters: '{"speed": 2}' });
        assert.deepStrictEqual(plain(await pending), { speed: 2 });
    });

    it('serializes node, parameter, and value for the parameter-update service', async function () {
        const ctx = loadFunctions('reconfigure', ['setNodeParameter'], environment());
        const pending = ctx.setNodeParameter('/node', 'speed', 2.5);
        const service = ctx.services[0];
        assert.strictEqual(service.options.name, '/vizanti/set_node_parameter');
        assert.deepStrictEqual(plain(service.request), { node: '/node', param: 'speed', value: '2.5' });
        service.resolve({ success: true });
        assert.deepStrictEqual(plain(await pending), { success: true });
    });
});
