import assert from 'assert';
import fs from 'fs';
import vm from 'vm';

const sourcePath = new URL('../public/js/modules/rosbridge.js', import.meta.url);
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace("import '../lib/roslib.min.js';", '');
source = source.replace(
	"const paramsModule = await import(`${base_url}/ros_launch_params`);\nconst params = paramsModule.default;",
	'const params = injectedParams;'
);
source = source.replace('export var rosbridge = new Rosbridge(window.location.hostname);', 'return { Rosbridge, rosbridge: new Rosbridge(window.location.hostname) };');

class FakeRos {
	constructor(options) {
		this.options = options;
		this.handlers = new Map();
		this.connectCalls = [];
		this.closeCalls = 0;
	}

	on(event, callback) {
		this.handlers.set(event, callback);
	}

	emit(event, value) {
		const handler = this.handlers.get(event);
		if (handler) handler(value);
	}

	connect(url) {
		this.connectCalls.push(url);
	}

	close() {
		this.closeCalls++;
	}
}

class FakeServiceRequest {
	constructor(values) {
		Object.assign(this, values);
	}
}

class FakeService {
	constructor(options) {
		this.options = options;
		this.requests = [];
		this.nextResult = {};
	}

	callService(request, callback) {
		this.requests.push(request);
		callback(this.nextResult);
	}
}

function createHarness() {
	const windowListeners = new Map();
	const windowObject = {
		location: { hostname: 'vehicle.local' },
		dispatchEvent(event) {
			for (const callback of windowListeners.get(event.type) || []) callback(event);
		},
		addEventListener(type, callback) {
			const callbacks = windowListeners.get(type) || [];
			callbacks.push(callback);
			windowListeners.set(type, callbacks);
		},
	};
	const documentObject = {
		hidden: false,
		listeners: new Map(),
		addEventListener(type, callback) {
			this.listeners.set(type, callback);
		},
	};
	const context = {
		console,
		setTimeout,
		clearTimeout,
		window: windowObject,
		document: documentObject,
		Event: class Event { constructor(type) { this.type = type; } },
		ROSLIB: { Ros: FakeRos, Service: FakeService, ServiceRequest: FakeServiceRequest },
		injectedParams: { port_rosbridge: 5001, compression: 'none' },
	};
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	return new AsyncFunction('ROSLIB', 'window', 'document', 'Event', 'setTimeout', 'clearTimeout', 'injectedParams', `${source}`)(
		context.ROSLIB,
		context.window,
		context.document,
		context.Event,
		context.setTimeout,
		context.clearTimeout,
		context.injectedParams,
	).then(exports => ({ ...exports, windowObject, documentObject }));
}

(async () => {
	const harness = await createHarness();
	const { rosbridge, windowObject, documentObject } = harness;
	const events = [];
	windowObject.addEventListener('rosbridge_change', () => events.push(rosbridge.status));

	assert.equal(rosbridge.url, 'vehicle.local');
	assert.equal(rosbridge.port, 5001);
	assert.equal(rosbridge.connected, false);
	assert.equal(rosbridge.status, 'Connecting...');
	assert.equal(rosbridge.ros.options.url, 'ws://vehicle.local:5001');

	rosbridge.ros.emit('connection');
	assert.equal(rosbridge.connected, true);
	assert.equal(rosbridge.status, 'Connected.');

	rosbridge.ros.emit('error', new Error('connection failed'));
	assert.equal(rosbridge.connected, false);
	assert.equal(rosbridge.status, 'Failed to connect.');

	rosbridge.ros.emit('close');
	assert.equal(rosbridge.status, 'Connection lost.');
	await new Promise(resolve => setTimeout(resolve, 1050));
	assert.equal(rosbridge.status, 'Reconnecting...');
	assert.deepEqual(rosbridge.ros.connectCalls, ['ws://vehicle.local:5001']);

	documentObject.hidden = true;
	documentObject.listeners.get('visibilitychange')();
	assert.equal(rosbridge.suspended, true);
	assert.equal(rosbridge.status, 'Suspended (tab inactive).');
	await new Promise(resolve => setTimeout(resolve, 10));
	assert.equal(rosbridge.ros.closeCalls, 1);

	documentObject.hidden = false;
	documentObject.listeners.get('visibilitychange')();
	assert.equal(rosbridge.suspended, false);
	assert.equal(rosbridge.status, 'Reconnecting...');
	assert.equal(rosbridge.ros.connectCalls.length, 2);

	rosbridge.topics_client.nextResult = { topics: ['/z', '/a'], types: ['TypeZ', 'TypeA'] };
	assert.deepEqual(await rosbridge.get_all_topics(), {
		topics: ['/a', '/z'],
		types: ['TypeA', 'TypeZ'],
	});

	rosbridge.services_for_type_client.nextResult = { services: ['/set_mode'] };
	assert.deepEqual(await rosbridge.get_services('ExampleType'), ['/set_mode']);
	assert.equal(rosbridge.services_for_type_client.requests[0].type, 'ExampleType');

	assert.ok(events.includes('Connected.'));
	assert.ok(events.includes('Connection lost.'));
	console.log('rosbridge adapter tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
