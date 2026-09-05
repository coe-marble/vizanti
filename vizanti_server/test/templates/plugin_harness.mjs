import assert from 'assert';
import fs from 'fs';
import vm from 'vm';

// Evaluate exact production function declarations, without running browser startup.
// Node's parser finds the declaration boundary (including nested functions, strings,
// comments and templates). Missing/renamed functions fail instead of silently skipping.
export function loadFunctions(plugin, names, dependencies = {}) {
    const url = new URL(`../../public/templates/${plugin}/${plugin}_script.js`, import.meta.url);
    // The installed Node runtime predates optional chaining and nullish coalescing.
    // Translate the forms used by extracted functions only; production source stays
    // untouched and continues to run in the browser's supported JavaScript runtime.
    const source = fs.readFileSync(url, 'utf8')
        .replace(/event\.detail\?\.id/g, '(event.detail == null ? undefined : event.detail.id)')
        .replace(/selectedVehicle\.gotoTopic\?\.trim\(\)/g,
            '(selectedVehicle.gotoTopic == null ? undefined : selectedVehicle.gotoTopic.trim())')
        .replace(/selectedVehicle\?\.pathTopic\?\.trim\(\)/g,
            '(selectedVehicle == null || selectedVehicle.pathTopic == null ? undefined : selectedVehicle.pathTopic.trim())')
        .replace(/posearray\[i\]\?\.pose\?\.position/g,
            '(posearray[i] && posearray[i].pose ? posearray[i].pose.position : undefined)')
        .replace(/posearray\[i \+ 1\]\?\.pose\?\.position/g,
            '(posearray[i + 1] && posearray[i + 1].pose ? posearray[i + 1].pose.position : undefined)')
        .replace(/frameName \?\? ""/g,
            '(frameName !== null && frameName !== undefined ? frameName : "")');
    const context = vm.createContext({ ...dependencies });
    for (const name of names) {
        const start = new RegExp(`^(?:async )?function ${name}\\s*\\(`, 'm').exec(source);
        assert.ok(start, `${plugin}: production function ${name} not found`);
        const lines = source.slice(start.index).split('\n');
        let declaration = '';
        let found = false;
        for (const line of lines) {
            declaration += `${line}\n`;
            try {
                new vm.Script(`(${declaration})`);
            } catch (error) {
                if (error.name === 'SyntaxError') continue;
                throw error;
            }
            new vm.Script(declaration, {
                filename: url.pathname,
                lineOffset: source.slice(0, start.index).split('\n').length - 1,
            }).runInContext(context);
            found = true;
            break;
        }
        assert.ok(found, `${plugin}: could not parse ${name}`);
    }
    return context;
}

// Normalize cross-context objects for strict payload comparisons.
export const plain = value => JSON.parse(JSON.stringify(value));

export function spy(implementation = () => undefined) {
    const calls = [];
    const fn = (...args) => {
        calls.push(args);
        return implementation(...args);
    };
    fn.calls = calls;
    return fn;
}

export function element(value = '') {
    const classes = new Set();
    return {
        value, checked: false, innerText: '', textContent: '', innerHTML: '',
        style: { setProperty: spy() }, dataset: {}, children: [],
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: (name, force) => {
                if (force === undefined) force = !classes.has(name);
                if (force) classes.add(name);
                else classes.delete(name);
                return force;
            },
        },
        appendChild(child) { this.children.push(child); },
    };
}

export function environment(overrides = {}) {
    const topics = [];
    const services = [];
    class Message { constructor(value) { Object.assign(this, value); } }
    class Topic {
        constructor(options) {
            this.options = options;
            this.publish = spy();
            this.unsubscribe = spy();
            this.unadvertise = spy();
            topics.push(this);
        }
        subscribe(callback) { this.callback = callback; }
        emit(message) { return this.callback(message); }
    }
    class Service {
        constructor(options) { this.options = options; services.push(this); }
        callService(request, resolve, reject) {
            Object.assign(this, { request, resolve, reject });
        }
    }
    return {
        topics, services, ROSLIB: { Topic, Service, Message, ServiceRequest: Message },
        rosbridge: { ros: {}, compression: 'cbor' },
        status: { setOK: spy(), setWarn: spy(), setError: spy() },
        saveSettings: spy(), console: { log: spy(), error: spy() },
        setTimeout: spy(), clearTimeout: spy(), clearInterval: spy(), alert: spy(),
        topic: '/test', listener: undefined, throttle: element('100'),
        tf: { fixed_frame: 'map', absoluteTransforms: {}, frame_list: new Set() },
        ...overrides,
    };
}

// Shared cases are registered inside each plugin's suite in Test Explorer.
export function subscriptionCases(plugin, topicVariable, messageType, setup = () => ({})) {
    describe('subscription lifecycle', function () {
        function arrange(topic = '/test') {
            const env = environment({ [topicVariable]: undefined, ...setup(), topic });
            return loadFunctions(plugin, ['connect'], env);
        }
        it('rejects an empty topic without subscribing', function () {
            const ctx = arrange('');
            ctx.connect();
            assert.strictEqual(ctx.topics.length, 0);
            assert.strictEqual(ctx.status.setError.calls[0][0], 'Empty topic.');
        });
        it('subscribes with the configured topic, type and queue limit', function () {
            const ctx = arrange();
            ctx.connect();
            const options = ctx.topics[0].options;
            assert.strictEqual(options.name, '/test');
            assert.strictEqual(options.messageType, messageType);
            assert.strictEqual(options.queue_length, 1);
            assert.strictEqual(typeof ctx.topics[0].callback, 'function');
            assert.strictEqual(ctx.status.setWarn.calls[0][0], 'No data received.');
            assert.strictEqual(ctx.saveSettings.calls.length, 1);
        });
        it('unsubscribes the previous topic when reconnecting', function () {
            const ctx = arrange();
            ctx.connect();
            ctx.topic = '/replacement';
            ctx.connect();
            assert.strictEqual(ctx.topics.length, 2);
            assert.strictEqual(ctx.topics[0].unsubscribe.calls.length, 1);
            assert.strictEqual(ctx.topics[1].options.name, '/replacement');
        });
    });
}
