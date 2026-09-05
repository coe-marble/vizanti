import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('temperature plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('temperature');
    });

    subscriptionCases('temperature', 'temperature_topic', 'sensor_msgs/msg/Temperature');
    for (const [temperature, expected] of [[-1, 'cold'], [0, 'warm'], [20, 'warm'], [21, 'hot']]) {
        it(`renders ${temperature} degrees as ${expected}, including threshold boundaries`, function () {
            const ctx = loadFunctions('temperature', ['connect'], environment({
                temperature_topic: undefined, lowBox: element('0'), highBox: element('20'),
                icon: element(), icons: { hot: 'hot', cold: 'cold', warm: 'warm' },
                text_temperature: element(), text_variance: element(), text_link: element(),
            }));
            ctx.connect();
            ctx.topics[0].emit({ temperature, variance: 0.125, header: { frame_id: 'sensor' } });
            assert.strictEqual(ctx.icon.src, expected);
            assert.strictEqual(ctx.text_temperature.innerText, `Temperature (°C): ${temperature.toFixed(2)}`);
            assert.strictEqual(ctx.text_variance.innerText, 'Variance: 0.13');
            assert.strictEqual(ctx.text_link.innerText, 'TF Frame: sensor');
            assert.strictEqual(ctx.status.setOK.calls.length, 1);
        });
    }
    it('persists the selected topic and both temperature limits', function () {
        const settings = { save: spy() };
        const ctx = loadFunctions('temperature', ['saveSettings'], { settings, topic: '/temp', lowBox: element('-5'), highBox: element('40') });
        ctx.saveSettings();
        assert.deepStrictEqual(plain(settings['{uniqueID}']), { topic: '/temp', low: '-5', high: '40' });
        assert.strictEqual(settings.save.calls.length, 1);
    });

});
