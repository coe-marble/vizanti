import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, plain, spy } from './plugin_harness.mjs';

describe('button plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('button');
    });

    function arrangeLongPress() {
        const scheduled = [];
        const ctx = loadFunctions('button', ['startLongPress', 'cancelLongPress'], {
            isLongPress: false, longPressTimer: undefined,
            endpointConfigurationEditor: { refresh: spy() }, openModal: spy(),
            setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
            clearTimeout: spy(),
        });
        return { ctx, scheduled };
    }

    it('refreshes its endpoint editor and opens its modal after a 500 ms long press', function () {
        const { ctx, scheduled } = arrangeLongPress();
        ctx.startLongPress();
        scheduled[0].callback();
        assert.strictEqual(scheduled[0].delay, 500);
        assert.strictEqual(ctx.isLongPress, true);
        assert.strictEqual(ctx.endpointConfigurationEditor.refresh.calls.length, 1);
        assert.deepStrictEqual(ctx.openModal.calls, [['{uniqueID}_modal']]);
    });

    it('cancels a pending long press', function () {
        const { ctx } = arrangeLongPress();
        ctx.longPressTimer = 4;
        ctx.cancelLongPress();
        assert.deepStrictEqual(ctx.clearTimeout.calls, [[4]]);
    });

    it('publishes a stable Bool message for the Bool topic behavior', async function () {
        const configuration = { adapterId: 'ros2', endpoint: { topic: '/enabled' } };
        const publish = spy();
        const ctx = loadFunctions('button', ['activeEndpointConfiguration', 'sendMessage'], {
            endpointConfigurationEditor: { activeConfiguration: configuration },
            endpointService: { publish },
            guiMessages: { createBool: value => ({ type: 'vizanti/Bool', value }) },
            actionMode: 'bool_topic', value: false, icondiv: element(), status: { setError: spy() },
            setTimeout: spy(),
        });

        await ctx.sendMessage();
        assert.deepStrictEqual(plain(publish.calls), [[configuration, { type: 'vizanti/Bool', value: true }]]);
    });

    it('calls the SetBool service with a stable Bool request', async function () {
        const configuration = { adapterId: 'ros2', endpoint: { service: '/enabled' } };
        const call = spy(async () => ({ success: true, message: 'updated' }));
        const updateIcon = spy();
        const status = { setOK: spy(), setError: spy() };
        const ctx = loadFunctions('button', ['activeEndpointConfiguration', 'sendMessage'], {
            endpointConfigurationEditor: { activeConfiguration: configuration },
            endpointService: { call },
            guiMessages: { createBool: value => ({ type: 'vizanti/Bool', value }) },
            actionMode: 'setbool_service', value: false, icondiv: element(), updateIcon, status,
            setTimeout: spy(),
        });

        await ctx.sendMessage();
        assert.deepStrictEqual(plain(call.calls), [[configuration, { type: 'vizanti/Bool', value: true }]]);
        assert.strictEqual(ctx.value, true);
        assert.deepStrictEqual(status.setOK.calls, [['updated']]);
    });
});
