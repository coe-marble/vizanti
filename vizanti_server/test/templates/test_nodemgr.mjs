import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, plain } from './plugin_harness.mjs';

describe('nodemgr plugin services', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('nodemgr');
    });

    for (const [functionName, argument, endpoint, expectedRequest, response] of [
        ['getExecutables', 'demo_pkg', '/vizanti/list_executables', { package: 'demo_pkg' }, { executables: ['talker'] }],
        ['getPackages', undefined, '/vizanti/list_packages', {}, { packages: ['demo_pkg'] }],
        ['startNode', 'demo_pkg talker', '/vizanti/node/start', { node: 'demo_pkg talker' }, { success: true }],
        ['killNode', '/talker', '/vizanti/node/kill', { node: '/talker' }, { success: true }],
        ['nodeInfo', '/talker', '/vizanti/node/info', { node: '/talker' }, { message: 'node info' }],
    ]) {
        it(`${functionName} calls ${endpoint} with the expected request`, async function () {
            const ctx = loadFunctions('nodemgr', [functionName], environment());
            const pending = argument === undefined ? ctx[functionName]() : ctx[functionName](argument);
            const service = ctx.services[0];
            assert.strictEqual(service.options.name, endpoint);
            assert.deepStrictEqual(plain(service.request), expectedRequest);
            service.resolve(response);
            const result = await pending;
            if (functionName === 'getExecutables') assert.deepStrictEqual(plain(result), ['talker']);
            else if (functionName === 'getPackages') assert.deepStrictEqual(plain(result), ['demo_pkg']);
            else if (functionName === 'nodeInfo') assert.strictEqual(result, 'node\u00a0info');
            else assert.deepStrictEqual(plain(result), response);
        });
    }
});
