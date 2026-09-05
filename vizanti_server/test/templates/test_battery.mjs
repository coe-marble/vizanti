import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('battery plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('battery');
    });

    subscriptionCases('battery', 'batterytopic', 'sensor_msgs/msg/BatteryState');
    function arrange() {
        const env = environment({ batterytopic: undefined, icon: element(),
            icons: Object.fromEntries(['20%', '40%', '60%', '80%', '100%', 'charging_20%'].map(x => [x, x])),
            STATUS: ['UNKNOWN', 'CHARGING', 'DISCHARGING'], HEALTH: ['UNKNOWN', 'GOOD'],
            CHEMISTRY: ['UNKNOWN', 'NIMH'],
        });
        for (const name of ['percent', 'voltage', 'cell_voltage', 'current', 'charge', 'status', 'health', 'chemistry']) env[`text_${name}`] = element();
        const ctx = loadFunctions('battery', ['connect'], env);
        ctx.connect();
        return ctx;
    }
    function message(percentage, status = 2) {
        return { percentage, power_supply_status: status, power_supply_health: 1,
            power_supply_technology: 1, voltage: 12.345, current: 1.234,
            charge: 2, capacity: 4, cell_voltage: [3.456, 3.567] };
    }
    for (const [percentage, expected] of [[0, '20%'], [0.2, '20%'], [0.21, '40%'], [0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']]) {
        it(`selects the ${expected} icon at charge ${percentage}`, function () {
            const ctx = arrange();
            ctx.topics[0].emit(message(percentage));
            assert.strictEqual(ctx.icon.src, expected);
        });
    }
    it('uses the charging icon and formats telemetry and cell voltages', function () {
        const ctx = arrange();
        ctx.topics[0].emit(message(0.2, 1));
        assert.strictEqual(ctx.icon.src, 'charging_20%');
        assert.strictEqual(ctx.text_percent.innerText, 'Percentage: 20 %');
        assert.strictEqual(ctx.text_voltage.innerText, 'Voltage: 12.35 V');
        assert.strictEqual(ctx.text_cell_voltage.innerText, 'Cell Voltages: 3.46 V, 3.57 V');
        assert.strictEqual(ctx.text_charge.innerText, 'Charge: 2.00/4.00 Ah');
        assert.strictEqual(ctx.text_status.innerText, 'Status: CHARGING');
        assert.strictEqual(ctx.status.setOK.calls.length, 1);
    });

});
