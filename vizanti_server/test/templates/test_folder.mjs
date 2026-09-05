import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, spy } from './plugin_harness.mjs';

describe('folder plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('folder');
    });

    function arrange(children, existingObservers = []) {
        const createdObservers = [];
        class MutationObserver {
            constructor(callback) {
                this.callback = callback;
                this.disconnect = spy();
                this.observe = spy();
                createdObservers.push(this);
            }
        }
        const subicons = [
            { style: {}, data: '', onload: undefined },
            { style: {}, data: '', onload: undefined },
        ];
        const subtextss = [{ innerText: '' }, { innerText: '' }];
        const utilModule = { setIconColor: spy() };
        const ctx = loadFunctions('folder', ['set_icons'], {
            observers: existingObservers, icon_container: { getElementsByClassName: () => children },
            subicons, subtextss, utilModule, MutationObserver,
        });
        return { ctx, subicons, subtextss, utilModule, createdObservers };
    }

    function image(src, text = '', color = undefined) {
        return {
            tagName: 'IMG', src, dataset: { text, color },
            hasAttribute: name => name === 'data-color' && color !== undefined,
        };
    }

    function iconChild(firstElementChild) {
        return { firstElementChild };
    }

    it('mirrors a child image source and text into the first folder subicon', function () {
        const { ctx, subicons, subtextss, createdObservers } = arrange([
            iconChild(image('assets/battery.svg', 'Battery')),
        ]);
        ctx.set_icons();
        assert.strictEqual(subicons[0].style.display, 'block');
        assert.strictEqual(subicons[0].data, 'assets/battery.svg');
        assert.strictEqual(subtextss[0].innerText, 'Battery');
        assert.strictEqual(createdObservers.length, 1);
        assert.strictEqual(createdObservers[0].observe.calls.length, 1);
    });

    it('mirrors the second child and clears text when it is not configured', function () {
        const { ctx, subicons, subtextss } = arrange([
            iconChild(image('assets/battery.svg', 'Battery')),
            iconChild(image('assets/map.svg')),
        ]);
        ctx.set_icons();
        assert.strictEqual(subicons[1].style.display, 'block');
        assert.strictEqual(subicons[1].data, 'assets/map.svg');
        assert.strictEqual(subtextss[1].innerText, '');
    });

    it('does not render the add-widget placeholder as a folder subicon', function () {
        const { ctx, subicons } = arrange([iconChild(image('assets/add.svg'))]);
        ctx.set_icons();
        assert.strictEqual(subicons[0].style.display, 'none');
    });

    it('applies a source icon colour after the mirrored object has loaded', function () {
        const { ctx, subicons, utilModule } = arrange([
            iconChild(image('assets/battery.svg', 'Battery', '#00ff00')),
        ]);
        ctx.set_icons();
        subicons[0].onload();
        assert.deepStrictEqual(utilModule.setIconColor.calls, [[subicons[0], '#00ff00']]);
    });

    it('disconnects existing observers before rebuilding the subicons', function () {
        const previousObserver = { disconnect: spy() };
        const { ctx } = arrange([iconChild(image('assets/battery.svg'))], [previousObserver]);
        ctx.set_icons();
        assert.strictEqual(previousObserver.disconnect.calls.length, 1);
        assert.strictEqual(ctx.observers.length, 1);
    });
});
