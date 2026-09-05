import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('inspector plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('inspector');
    });

    const setup = () => ({ topic_type: 'custom/msg/Data', prevtopic: '', live_data_div: element(), info_div: element() });
    subscriptionCases('inspector', 'topicobj', 'custom/msg/Data', setup);
    function arrange() {
        const ctx = loadFunctions('inspector', ['connect'], environment({ ...setup(), topicobj: undefined,
            document: { createElement: () => element() },
            rosbridge: { ros: {}, get_topic_publishers_and_subscribers: async () => ({ publishers: ['node'] }) },
        })); ctx.connect(); return ctx;
    }
    it('resets old display contents when the topic changes', function () {
        const ctx = arrange();
        assert.strictEqual(ctx.live_data_div.innerHTML, '<p>Waiting for data...</p>');
        assert.strictEqual(ctx.info_div.innerHTML, '<p>Waiting for data...</p>');
        assert.strictEqual(ctx.prevtopic, '/test');
    });
    it('limits long strings and arrays while reporting omitted items', async function () {
        const ctx = arrange();
        await ctx.topics[0].emit({ long: 'x'.repeat(201), values: Array.from({ length: 55 }, (_, i) => i) });
        const rows = ctx.live_data_div.children[0].children.map(x => x.textContent);
        assert.strictEqual(rows[0], `long: ${'x'.repeat(200)}... [truncated]`);
        assert.strictEqual(rows[1], 'values: Array(55)');
        assert.strictEqual(rows.length, 53);
        assert.strictEqual(rows[52], '... 5 more items');
        assert.strictEqual(ctx.info_div.children.length, 1);
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });

});
