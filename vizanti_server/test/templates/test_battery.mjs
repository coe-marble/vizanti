import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy } from './plugin_harness.mjs';

describe('battery plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('battery');
    });

    function arrange(configuration = { endpoint: { topic: '/battery' } }) {
        const subscription = { unsubscribe: spy() };
        const endpointService = { subscribe: spy(() => subscription) };
        const env = environment({ subscription: undefined, endpointConfigurationEditor: { activeConfiguration: configuration },
            endpointService, endpointMessageType: 'vizanti/BatteryState', icon: element(),
            icons: Object.fromEntries(['20%', '40%', '60%', '80%', '100%', 'charging_20%'].map(x => [x, x])),
            STATUS: ['UNKNOWN', 'CHARGING', 'DISCHARGING'], HEALTH: ['UNKNOWN', 'GOOD'],
            CHEMISTRY: ['UNKNOWN', 'NIMH'],
        });
        for (const name of ['percent', 'voltage', 'cell_voltage', 'current', 'charge', 'status', 'health', 'chemistry']) env[`text_${name}`] = element();
        const ctx = loadFunctions('battery', ['activeEndpointConfiguration', 'connect'], env);
        ctx.connect();
        return ctx;
    }
    function message(percentage, status = 2) {
        return { percentage, powerSupplyStatus: status, powerSupplyHealth: 1,
            powerSupplyTechnology: 1, voltage: 12.345, current: 1.234,
            charge: 2, capacity: 4, cellVoltage: [3.456, 3.567] };
    }
    function emit(ctx, payload) {
        return ctx.endpointService.subscribe.calls[0][2](payload);
    }
    it('requires a configured endpoint before subscribing', function () {
        const ctx = arrange(null);
        assert.strictEqual(ctx.endpointService.subscribe.calls.length, 0);
        assert.strictEqual(ctx.status.setError.calls[0][0], 'Select a battery endpoint.');
    });
    it('migrates a legacy topic into the shared endpoint configuration', function () {
        const ctx = loadFunctions('battery', ['legacyEndpointConfiguration']);
        assert.deepEqual(JSON.parse(JSON.stringify(ctx.legacyEndpointConfiguration('/battery'))), {
            mode: 'manual',
            robotModelId: '',
            manualAdapterConfiguration: {
                adapterId: 'ros2',
                values: { namespace: '', tfFrame: 'base_link' },
            },
            endpointConfiguration: {
                endpointValues: {},
                outputMessageId: '',
                endpointId: '/battery',
                manualEndpointId: '/battery',
                endpoint: null,
                endpointMode: 'manual',
            },
        });
    });
    it('subscribes through the endpoint service and replaces old subscriptions', function () {
        const ctx = arrange();
        assert.strictEqual(ctx.endpointService.subscribe.calls[0][0].endpoint.topic, '/battery');
        assert.strictEqual(ctx.endpointService.subscribe.calls[0][1], 'vizanti/BatteryState');
        assert.strictEqual(ctx.status.setWarn.calls[0][0], 'No data received.');
        assert.strictEqual(ctx.saveSettings.calls.length, 1);

        ctx.connect();
        assert.strictEqual(ctx.subscription.unsubscribe.calls.length, 1);
        assert.strictEqual(ctx.endpointService.subscribe.calls.length, 2);
    }
    for (const [percentage, expected] of [[0, '20%'], [0.2, '20%'], [0.21, '40%'], [0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']]) {
        it(`selects the ${expected} icon at charge ${percentage}`, function () {
            const ctx = arrange();
            emit(ctx, message(percentage));
            assert.strictEqual(ctx.icon.src, expected);
        });
    }
    it('uses the charging icon and formats telemetry and cell voltages', function () {
        const ctx = arrange();
        emit(ctx, message(0.2, 1));
        assert.strictEqual(ctx.icon.src, 'charging_20%');
        assert.strictEqual(ctx.text_percent.innerText, 'Percentage: 20 %');
        assert.strictEqual(ctx.text_voltage.innerText, 'Voltage: 12.35 V');
        assert.strictEqual(ctx.text_cell_voltage.innerText, 'Cell Voltages: 3.46 V, 3.57 V');
        assert.strictEqual(ctx.text_charge.innerText, 'Charge: 2.00/4.00 Ah');
        assert.strictEqual(ctx.text_status.innerText, 'Status: CHARGING');
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });

});
