import { runTemplateContract } from './template_test_helpers.mjs';
import assert from 'assert';
import fs from 'fs';

// Load the production script and replace browser/protocol imports in the test copy.
let source = fs.readFileSync(new URL('../../public/templates/altimeter/altimeter_script.js', import.meta.url), 'utf8');
source = source.replace(/let viewModule[\s\S]*?let Status = StatusModule\.Status;\n/, 'let rosbridge = sourceProvider;\n');
source = source.replace('rosbridge.get_topics("std_msgs/msg/Float32")', 'sourceProvider.getTopics("target")');
source = source.replace('event.changedTouches?.[0] ?? event.touches?.[0] ?? event', '(event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]) || event');
source += '\nreturn { getMeters, publishTarget, modeSelector, frameSelector, selectionbox };';

// Minimal DOM and CSS-class stubs required during plugin initialization.
class ClassList {
	add() {}
	remove() {}
}

// Generic DOM element stub that records event handlers for simulation.
function element(id, value = '') {
	return {
		id,
		value,
		innerText: '',
		innerHTML: '',
		style: {},
		classList: new ClassList(),
		listeners: {},
		isConnected: true,
		addEventListener(type, callback) { this.listeners[type] = callback; },
		getElementsByTagName() { return [{ src: '', style: {}, addEventListener() {} }]; },
		getContext() { return new Proxy({}, { get: () => () => {} }); },
	};
}

describe('altimeter plugin', function () {
	it('preserves the template contract', function () {
		runTemplateContract('altimeter');
	});

	async function arrange() {
		const elements = new Map([
		['{uniqueID}_icon', element('{uniqueID}_icon')],
		['{uniqueID}_status', element('{uniqueID}_status')],
		['{uniqueID}_arrow', element('{uniqueID}_arrow')],
		['{uniqueID}_canvas', element('{uniqueID}_canvas')],
		['icon_bar', { offsetHeight: 0 }],
		['{uniqueID}_topic', element('{uniqueID}_topic')],
		['{uniqueID}_frame', element('{uniqueID}_frame', 'base_link')],
		['{uniqueID}_mode', element('{uniqueID}_mode', 'altitude_positive')],
		['{uniqueID}_step', element('{uniqueID}_step', '1')],
		['{uniqueID}_altitude_text', element('{uniqueID}_altitude_text')],
		['{uniqueID}_target_text', element('{uniqueID}_target_text')],
		['{uniqueID}_imgpreview', element('{uniqueID}_imgpreview')],
		['{uniqueID}_manual_target', element('{uniqueID}_manual_target')],
		]);
		const windowStub = {
		innerHeight: 600,
		innerWidth: 1200,
		addEventListener() {},
		requestAnimationFrame() {},
		};
		const documentStub = {
		hidden: false,
		getElementById(id) { return elements.get(id); },
		querySelectorAll() { return []; },
		addEventListener() {},
		};
		const settings = { hasOwnProperty() { return false; }, save() {} };
		const statuses = [];
		const Status = class {
		constructor() {}
		setWarn(message) { statuses.push(['warn', message]); }
		setError(message) { statuses.push(['error', message]); }
		setOK(message) { statuses.push(['ok', message]); }
		};
		const tf = {
		frame_list: new Set(),
		transforms: {},
		absoluteTransforms: {},
		};
		const published = [];
		class Topic {
		constructor(options) { this.options = options; }
		subscribe() { return () => {}; }
		publish(message) { published.push({ options: this.options, message }); }
		unadvertise() {}
		}
		const sourceProvider = {
		compression: 'none',
		ros: {},
		async getTopics() { return []; },
		};
		const ROSLIB = {
		Topic,
		Message: class { constructor(message) { Object.assign(this, message); } },
		};
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		const exports = await new AsyncFunction(
		'sourceProvider', 'settings', 'Status', 'tf', 'document', 'window', 'ROSLIB', 'performance',
		`return (async () => { ${source} })();`
		)(sourceProvider, settings, Status, tf, documentStub, windowStub, ROSLIB, { now() { return 100; } });
		return { elements, exports, published, statuses, tf };
	}

	it('reads altitude from the selected frame transform', async function () {
		const { exports, statuses, tf } = await arrange();
		tf.absoluteTransforms.base_link = { translation: { x: 0, y: 0, z: 3 } };
		assert.equal(exports.getMeters(), 3);
		assert.equal(statuses[statuses.length - 1][0], 'ok');
	});

	it('clamps inverted depth below zero', async function () {
		const { elements, exports, tf } = await arrange();
		tf.absoluteTransforms.base_link = { translation: { x: 0, y: 0, z: 3 } };
		elements.get('{uniqueID}_mode').value = 'depth_negative';
		assert.equal(exports.getMeters(), 0);
	});

	it('reports a missing selected frame', async function () {
		const { exports, statuses } = await arrange();
		assert.equal(exports.getMeters(), 0);
		assert.equal(statuses[statuses.length - 1][0], 'error');
	});

	it('uses the selected output topic for published targets', async function () {
		const { elements, exports, published } = await arrange();
		elements.get('{uniqueID}_topic').value = '/target';
		exports.selectionbox.listeners.change({});
		exports.publishTarget(2.5);
		assert.equal(published[0].options.name, '/target');
		assert.equal(published[0].message.data, 2.5);
	});

	it('inverts published targets in negative depth mode', async function () {
		const { elements, exports, published } = await arrange();
		elements.get('{uniqueID}_mode').value = 'depth_negative';
		elements.get('{uniqueID}_topic').value = '/target';
		exports.selectionbox.listeners.change({});
		exports.publishTarget(2.5);
		assert.equal(published[0].message.data, -2.5);
	});
});
