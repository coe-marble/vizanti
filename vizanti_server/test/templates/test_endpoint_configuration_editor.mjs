import assert from 'assert';
import { createAdapterConfigurationEditor } from '../../public/js/modules/adapter_configuration_editor.js';
import { createEndpointConfiguration, createEndpointConfigurationEditor } from '../../public/js/modules/endpoint_configuration_editor.js';

function createDocumentStub() {
	const created = [];
	function createElement(tagName) {
		const element = {
			tagName,
			children: [],
			listeners: {},
			className: '',
			value: '',
			hidden: false,
			disabled: false,
			checked: false,
			appendChild(child) {
				child.parentNode = this;
				this.children.push(child);
				return child;
			},
			addEventListener(type, listener) {
				this.listeners[type] = listener;
			},
		};
		Object.defineProperty(element, 'innerHTML', {
			get() { return ''; },
			set() { this.children = []; },
		});
		created.push(element);
		return element;
	}
	return {
		created,
		document: {
			createElement,
			createTextNode(textContent) { return { textContent }; },
		},
	};
}

function withDocument(callback) {
	const originalDocument = global.document;
	const stub = createDocumentStub();
	global.document = stub.document;
	return Promise.resolve(callback(stub)).finally(() => {
		global.document = originalDocument;
	});
}

describe('endpoint configuration editor', function () {
	it('renders every adapter configuration field on its own row', async function () {
		await withDocument(async ({ created, document }) => {
			const endpointService = {
				listAdapters: () => [{ id: 'ros2', label: 'ROS2' }],
				configurationFields: () => [
					{ id: 'namespace', label: 'Namespace', defaultValue: '' },
					{ id: 'tfFrame', label: 'TF frame', defaultValue: 'base_link' },
				],
				endpointFields: () => [],
			};
			const container = document.createElement('div');
			const editor = createAdapterConfigurationEditor({ container, endpointService });
			editor.refresh();
			const labels = created.filter((element) => element.tagName === 'label').map((element) => element.textContent);
			assert.deepEqual(labels, ['Adapter:', 'Namespace:', 'TF frame:']);
			const rows = created.filter((element) => element.className === 'configuration-field');
			assert.equal(rows.length, 3);
		});
	});

	it('uses the manual address field when its checkbox is enabled', async function () {
		await withDocument(async ({ created, document }) => {
			const manualCalls = [];
			const endpointService = {
				listAdapters: () => [{ id: 'ros2', label: 'ROS2' }],
				configurationFields: () => [],
				endpointFields: () => [
					{ id: 'outputMessageId', label: 'Message', control: 'message' },
					{ id: 'endpointId', label: 'Topic', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Topic name' } },
				],
				listOutputMessages: () => [{ id: 'std_msgs/msg/Float64', label: 'Float64' }],
				async listEndpoints() { return []; },
				createManualEndpoint(...args) {
					manualCalls.push(args);
					const address = args[4];
					return address === '' ? null : {
						id: address,
						endpoint: { topic: `/robot/${address}`, nativeMessageType: 'std_msgs/msg/Float64' },
					};
				},
			};
			const container = document.createElement('div');
			const editor = createEndpointConfigurationEditor({
				container,
				endpointService,
				guiMessageType: 'vizanti/Float',
			});
			await editor.refresh();

			const checkbox = created.find((element) => element.type === 'checkbox');
			const manualInput = created.find((element) => element.placeholder === 'Topic name');
			assert.equal(manualInput.hidden, true);
			assert.strictEqual(manualInput.parentNode, checkbox.parentNode.parentNode);
			checkbox.checked = true;
			await checkbox.listeners.change();
			assert.equal(manualInput.hidden, false);
			manualInput.value = 'depth_target';
			await manualInput.listeners.input();

			assert.deepEqual(manualCalls[manualCalls.length - 1], [
				'ros2', {}, 'vizanti/Float', 'std_msgs/msg/Float64', 'depth_target',
			]);
			assert.deepEqual(editor.value.endpoint, {
				topic: '/robot/depth_target', nativeMessageType: 'std_msgs/msg/Float64',
			});
			assert.equal(editor.value.endpointMode, 'manual');
		});
	});

	it('keeps a saved endpoint when discovery is temporarily empty', async function () {
		await withDocument(async ({ created, document }) => {
			const endpointService = {
				listAdapters: () => [{ id: 'ros2', label: 'ROS2' }],
				configurationFields: () => [],
				endpointFields: () => [
					{ id: 'outputMessageId', label: 'Message', control: 'message' },
					{ id: 'endpointId', label: 'Topic', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Topic name' } },
				],
				listOutputMessages: () => [{ id: 'std_msgs/msg/Float64', label: 'Float64' }],
				async listEndpoints() { return []; },
			};
			const savedEndpoint = {
				topic: '/robot/depth_target',
				nativeMessageType: 'std_msgs/msg/Float64',
			};
			const container = document.createElement('div');
			const editor = createEndpointConfigurationEditor({
				container,
				endpointService,
				guiMessageType: 'vizanti/Float',
				configuration: {
					adapterId: 'ros2',
					adapterValues: {},
					outputMessageId: 'std_msgs/msg/Float64',
					endpointMode: 'select',
					endpointId: '/robot/depth_target',
					endpoint: savedEndpoint,
				},
			});
			await editor.refresh();

			assert.equal(editor.value.endpointId, '/robot/depth_target');
			assert.deepEqual(editor.value.endpoint, savedEndpoint);
			const endpointSelect = created.filter((element) => element.tagName === 'select')[2];
			assert.equal(endpointSelect.children[1].value, '/robot/depth_target');
		});
	});

	it('renders service fields supplied by the adapter', async function () {
		await withDocument(async ({ created, document }) => {
			const endpointService = {
				listAdapters: () => [{ id: 'ros2', label: 'ROS2' }],
				configurationFields: () => [],
				endpointFields: () => [
					{ id: 'serviceType', label: 'Service Type', control: 'text', placeholder: 'package_name/srv/Service' },
					{ id: 'serviceName', label: 'Service Name', control: 'text', placeholder: '/service_name' },
				],
			};
			const container = document.createElement('div');
			const editor = createEndpointConfigurationEditor({
				container,
				endpointService,
				guiMessageType: 'vizanti/Bool',
				endpointType: 'service',
				configuration: {
					adapterId: 'ros2', adapterValues: {},
					serviceType: 'std_srvs/srv/Trigger', serviceName: '/reset',
				},
			});
			await editor.refresh();

			const labels = created.filter((element) => element.tagName === 'label').map((element) => element.textContent);
			assert.deepEqual(labels, ['Adapter:', 'Service Type:', 'Service Name:']);
			assert.equal(created.find((element) => element.placeholder === 'package_name/srv/Service').value, 'std_srvs/srv/Trigger');
			assert.equal(created.find((element) => element.placeholder === '/service_name').value, '/reset');
			assert.equal(editor.value.endpointType, 'service');
		});
	});

	it('shares one endpoint configuration across Manual and Robot Model modes', async function () {
		await withDocument(async ({ created, document }) => {
			let discoveryCalls = 0;
			const endpoint = {
				topic: '/alpha/goal', nativeMessageType: 'geometry_msgs/msg/PoseStamped',
			};
			const endpointService = {
				listAdapters: () => [{ id: 'ros2', label: 'ROS2' }],
				configurationFields: () => [],
				endpointFields: () => [
					{ id: 'outputMessageId', label: 'Message', control: 'message' },
					{ id: 'endpointId', label: 'Topic', control: 'endpoint', manual: { label: 'Enter manually', placeholder: 'Topic name' } },
				],
				listOutputMessages: () => [{ id: 'geometry_msgs/msg/PoseStamped', label: 'PoseStamped' }],
				async listEndpoints() { discoveryCalls += 1; return []; },
			};
			const container = document.createElement('div');
			const configuration = createEndpointConfiguration({
				container,
				endpointService,
				guiMessageType: 'vizanti/Pose',
				endpointType: 'topic',
				configuration: {
					mode: 'robotmodel',
					robotModelId: 'robot-alpha',
					manualAdapterConfiguration: {
						adapterId: 'ros2', values: { namespace: '', tfFrame: 'base_link' },
					},
					endpointConfiguration: {
						outputMessageId: 'geometry_msgs/msg/PoseStamped',
						endpointMode: 'select', endpointId: '/alpha/goal', endpoint,
					},
				},
				getRobotModels: () => [{
					id: 'robot-alpha', name: 'Alpha', adapterConfiguration: {
						adapterId: 'ros2', values: { namespace: '/alpha', tfFrame: 'base_link' },
					},
				}],
			});
			await configuration.refresh();

			assert(created.some((element) => element.tagName === 'label' && element.textContent === 'Configuration:'));
			assert(created.some((element) => element.tagName === 'label' && element.textContent === 'Robot Model:'));
			assert.deepEqual(configuration.activeConfiguration, {
				...configuration.value.endpointConfiguration,
				endpointType: 'topic',
				adapterId: 'ros2',
				adapterValues: { namespace: '/alpha', tfFrame: 'base_link' },
			});
			const configurationMode = created.find((element) => element.tagName === 'select');
			configurationMode.value = 'manual';
			await configurationMode.listeners.change();
			assert.equal(discoveryCalls, 2);
			assert.deepEqual(configuration.activeConfiguration, {
				...configuration.value.endpointConfiguration,
				endpointType: 'topic',
				adapterId: 'ros2',
				adapterValues: { namespace: '', tfFrame: 'base_link' },
			});
			configurationMode.value = 'robotmodel';
			await configurationMode.listeners.change();
			assert.equal(discoveryCalls, 3);
			assert.deepEqual(configuration.value.endpointConfiguration, {
				outputMessageId: 'geometry_msgs/msg/PoseStamped',
				endpointMode: 'select', endpointId: '/alpha/goal', endpoint,
			});
			assert.deepEqual(configuration.activeConfiguration, {
				...configuration.value.endpointConfiguration,
				endpointType: 'topic',
				adapterId: 'ros2',
				adapterValues: { namespace: '/alpha', tfFrame: 'base_link' },
			});
		});
	});
});
