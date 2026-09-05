import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, spy, plain } from './plugin_harness.mjs';

describe('settings plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('settings');
    });

    it('saves the current fixed frame and background colour', function () {
        const settings = { save: spy() };
        const ctx = loadFunctions('settings', ['saveSettings'], {
            settings, tf: { fixed_frame: 'map' }, colourpicker: element('#123456'),
        });
        ctx.saveSettings();
        assert.deepStrictEqual(plain(settings['{uniqueID}']), { fixed_frame: 'map', background_color: '#123456' });
        assert.strictEqual(settings.save.calls.length, 1);
    });

    it('lists known frames and retains the selected fixed frame', function () {
        const selectionbox = element();
        const ctx = loadFunctions('settings', ['setFrameList'], {
            selectionbox, tf: { fixed_frame: 'map', frame_list: new Set(['map', 'odom']) },
        });
        ctx.setFrameList();
        assert.strictEqual(selectionbox.innerHTML, "<option value='map'>map</option><option value='odom'>odom</option>");
        assert.strictEqual(selectionbox.value, 'map');
    });

    it('keeps an unavailable fixed frame selectable', function () {
        const selectionbox = element();
        const ctx = loadFunctions('settings', ['setFrameList'], {
            selectionbox, tf: { fixed_frame: 'missing', frame_list: new Set(['map']) },
        });
        ctx.setFrameList();
        assert.ok(selectionbox.innerHTML.includes("<option value='missing'>missing</option>"));
        assert.strictEqual(selectionbox.value, 'missing');
    });
});
