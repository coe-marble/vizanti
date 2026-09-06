import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import { ENDPOINT_TYPE, assertAdapterContract } from '../../public/js/modules/adapters/contract.js';
import { GUI_MESSAGE_TYPE, createFloat } from '../../public/js/modules/gui_messages.js';

function loadAdapter(ROSLIB, rosbridge) {
	const url = new URL('../../public/js/modules/adapters/ros2.js', import.meta.url);
	const source = fs.readFileSync(url, 'utf8')
		.replace(/^import .*;\n/gm, '')
		.replace(/export const /g, 'const ')
		.replace(/export function /g, 'function ')
		.concat('\nglobalThis.adapterExports = { createRos2Adapter, localRos2Instance };');
	const context = vm.createContext({ ROSLIB, rosbridge, assertAdapterContract, ENDPOINT_TYPE, GUI_MESSAGE_TYPE, createFloat });
	new vm.Script(source, { filename: url.pathname }).runInContext(context);
	return context.adapterExports;
}

describe('ROS2 adapter', function () {
	function arrange(topicCatalog = { topics: ['/target'], types: ['std_msgs/msg/Float64'] }) {
		const topics = [];
		const services = [];
		class Topic {
			constructor(options) { this.options = options; topics.push(this); }
			subscribe(callback) { this.callback = callback; }
			unsubscribe(callback) { this.unsubscribedCallback = callback; }
			publish(message) { this.message = message; }
			unadvertise() { this.unadvertised = true; }
		}
		class Service {
			constructor(options) { this.options = options; services.push(this); }
			callService(request, resolve, reject) { this.request = request; this.resolve = resolve; this.reject = reject; }
		}
		class Message { constructor(value) { Object.assign(this, value); } }
		const ROSLIB = { Topic, Service, Message, ServiceRequest: Message };
		const bridge = {
			ros: { id: 'bridge' },
			async get_all_topics() { return topicCatalog; },
		};
		const { createRos2Adapter, localRos2Instance } = loadAdapter(ROSLIB, bridge);
		const adapter = createRos2Adapter({ ROSLIB, getClient(instance) {
			assert.strictEqual(instance, localRos2Instance);
			return bridge;
		} });
		return { adapter, localRos2Instance, topics, services };
	}

	it('declares namespace and TF frame as its configuration fields', function () {
		const { adapter } = arrange();
		assert.deepEqual(
			JSON.parse(JSON.stringify(adapter.configurationFields())),
			[
				{ id: 'namespace', label: 'Namespace', type: 'text', placeholder: '/robot_1', defaultValue: '' },
				{ id: 'tfFrame', label: 'TF frame', type: 'text', placeholder: 'base_link', defaultValue: 'base_link' },
			],
		);
	});

	it('declares topic and service fields for the endpoint editor', function () {
		const { adapter } = arrange();
		assert.deepEqual(JSON.parse(JSON.stringify(
			adapter.endpointFields(ENDPOINT_TYPE.TOPIC, GUI_MESSAGE_TYPE.FLOAT),
		)), [
			{ id: 'outputMessageId', label: 'Message', control: 'message' },
			{ id: 'endpointId', label: 'Topic', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Topic name' } },
		]);
		assert.deepEqual(JSON.parse(JSON.stringify(
			adapter.endpointFields(ENDPOINT_TYPE.SERVICE, GUI_MESSAGE_TYPE.FLOAT),
		)), [
			{ id: 'serviceType', label: 'Service Type', control: 'text', placeholder: 'package_name/srv/Service' },
			{ id: 'serviceName', label: 'Service Name', control: 'text', placeholder: '/service_name' },
		]);
	});

	it('limits endpoint choices to the configured namespace', async function () {
		const { adapter, localRos2Instance } = arrange({
			topics: ['/alpha/altitude', '/bravo/altitude'],
			types: ['std_msgs/msg/Float64', 'std_msgs/msg/Float64'],
		});
		const endpoints = await adapter.listEndpoints(
			localRos2Instance, { namespace: '/alpha' }, GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64',
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoints.map((endpoint) => endpoint.id))), ['/alpha/altitude']);
	});

	it('turns a manually entered relative address into a namespaced endpoint', function () {
		const { adapter, localRos2Instance } = arrange();
		const endpoint = adapter.createManualEndpoint(
			localRos2Instance, { namespace: '/alpha' }, GUI_MESSAGE_TYPE.FLOAT,
			'std_msgs/msg/Float64', 'depth_target',
		);
		assert.deepEqual(JSON.parse(JSON.stringify(endpoint)), {
			id: 'depth_target',
			label: 'depth_target',
			endpoint: { topic: '/alpha/depth_target', nativeMessageType: 'std_msgs/msg/Float64' },
		});
	});

	it('subscribes with the configured ROS topic and type', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		let value;
		const onValue = received => { value = received; };
		const subscription = adapter.subscribe(localRos2Instance, {
		}, {
			topic: '/altitude_target', nativeMessageType: 'std_msgs/msg/Float64',
		}, GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64', onValue);
		assert.deepEqual(topics[0].options, {
			ros: { id: 'bridge' }, name: '/altitude_target', messageType: 'std_msgs/msg/Float64',
		});
		topics[0].callback({ data: 3.5 });
		assert.deepEqual(value, { type: GUI_MESSAGE_TYPE.FLOAT, value: 3.5 });
		subscription.unsubscribe();
		assert.strictEqual(typeof topics[0].unsubscribedCallback, 'function');
	});

	it('publishes one ROS message and releases its publisher', function () {
		const { adapter, localRos2Instance, topics } = arrange();
		adapter.publish(localRos2Instance, {}, {
			topic: '/altitude_target', nativeMessageType: 'std_msgs/msg/Float64',
	}, 'std_msgs/msg/Float64', createFloat(2.5));
		assert.equal(topics[0].message.data, 2.5);
		assert.equal(topics[0].unadvertised, true);
	});

	it('calls a ROS service and resolves its response', async function () {
		const { adapter, localRos2Instance, services } = arrange();
		const response = adapter.call(localRos2Instance, {}, {
			service: '/reset', serviceType: 'example_interfaces/srv/Trigger',
		}, {});
		services[0].resolve({ success: true });
		assert.deepEqual(await response, { success: true });
	});

	it('rejects incomplete topic endpoints', function () {
		const { adapter, localRos2Instance } = arrange();
		assert.throws(
			() => adapter.subscribe(localRos2Instance, {}, {
				topic: '/target', nativeMessageType: 'std_msgs/msg/Float64',
			}, GUI_MESSAGE_TYPE.FLOAT, 'std_msgs/msg/Float64'),
		/message callback/,
		);
	});
});
