import { localRos2Instance, ros2Adapter } from './adapters/ros2.js';

const instances = new Map([
	[localRos2Instance.id, { instance: localRos2Instance, adapter: ros2Adapter, label: "ROS2" }],
]);
const DEFAULT_ADAPTER_ID = "ros2";

function resolveAdapterConfiguration(configuration) {
	if (!configuration || typeof configuration.adapterId !== "string") {
		throw new TypeError("Adapter configuration must select an adapter.");
	}
	const resolved = instances.get(configuration.adapterId);
	if (!resolved) {
		throw new TypeError(`Unknown adapter: ${configuration.adapterId}.`);
	}
	return resolved;
}

function resolve(configuration) {
	const resolved = resolveAdapterConfiguration(configuration);
	if (!configuration.endpoint) {
		throw new TypeError("Endpoint configuration must select an endpoint.");
	}
	return resolved;
}

export const endpointService = Object.freeze({
	listAdapters(guiMessageType, endpointType) {
		return [...instances.entries()]
			.filter(([, value]) => endpointType === "service"
				|| guiMessageType === undefined || value.adapter.supports(guiMessageType))
			.map(([id, value]) => ({ id, label: value.label }));
	},

	configurationFields(adapterId) {
		const resolved = instances.get(adapterId);
		return resolved ? resolved.adapter.configurationFields() : [];
	},

	endpointFields(adapterId, endpointType, guiMessageType) {
		const resolved = instances.get(adapterId);
		return resolved ? resolved.adapter.endpointFields(endpointType, guiMessageType) : [];
	},

	allowsDiscovery(adapterId, endpointType, guiMessageType) {
		const resolved = instances.get(adapterId);
		return resolved ? resolved.adapter.allowsDiscovery(endpointType, guiMessageType) : false;
	},

	listOutputMessages(adapterId, guiMessageType) {
		const resolved = instances.get(adapterId);
		return resolved && resolved.adapter.supports(guiMessageType)
			? resolved.adapter.listOutputMessages(guiMessageType) : [];
	},

	async discoverEndpoints({
		adapterConfiguration = null,
		endpointType = "topic",
		guiMessageType = undefined,
		outputMessageId = "",
		endpointValues = {},
	} = {}) {
		const discover = async (adapterId, resolved, values) => {
			if (!resolved.adapter.allowsDiscovery(endpointType, guiMessageType)) {
				return [];
			}
			const endpoints = await resolved.adapter.discoverEndpoints(
				resolved.instance, values, endpointType, guiMessageType,
				outputMessageId, endpointValues,
			);
			return endpoints.map((endpoint) => ({ ...endpoint, adapterId }));
		};

		if (adapterConfiguration) {
			const resolved = resolveAdapterConfiguration(adapterConfiguration);
			return discover(adapterConfiguration.adapterId, resolved, adapterConfiguration.values || {});
		}

		const discoveries = await Promise.all([...instances.entries()].map(([adapterId, resolved]) =>
			discover(adapterId, resolved, {})));
		return discoveries.flat();
	},

	createManualEndpoint(adapterId, adapterValues, endpointType, guiMessageType, outputMessageId, address, endpointValues) {
		const resolved = instances.get(adapterId);
		if (!resolved) {
			return null;
		}
		return resolved.adapter.createManualEndpoint(
			resolved.instance, adapterValues || {}, endpointType, guiMessageType,
			outputMessageId, address, endpointValues || {},
		);
	},

	async restoreEndpoint(adapterId, adapterValues, endpointType, guiMessageType, outputMessageId, endpointId, endpointValues) {
		const resolved = instances.get(adapterId);
		if (!resolved) {
			return null;
		}
		return resolved.adapter.restoreEndpoint(
			resolved.instance, adapterValues || {}, endpointType, guiMessageType,
			outputMessageId, endpointId, endpointValues || {},
		);
	},

	subscribe(configuration, guiMessageType, onMessage, deliveryOptions = {}) {
		const resolved = resolve(configuration);
		return resolved.adapter.subscribe(
			resolved.instance, configuration.adapterValues || {}, configuration.endpoint,
			guiMessageType, configuration.outputMessageId, onMessage, deliveryOptions,
		);
	},

	subscribeRaw(configuration, onMessage, deliveryOptions = {}) {
		const resolved = resolve(configuration);
		return resolved.adapter.subscribeRaw(
			resolved.instance, configuration.adapterValues || {}, configuration.endpoint,
			onMessage, deliveryOptions,
		);
	},

	getTopicInfo(configuration) {
		const resolved = resolve(configuration);
		return resolved.adapter.getTopicInfo(
			resolved.instance, configuration.adapterValues || {}, configuration.endpoint,
		);
	},

	publish(configuration, message) {
		const resolved = resolve(configuration);
		return resolved.adapter.publish(
			resolved.instance, configuration.adapterValues || {}, configuration.endpoint,
			configuration.outputMessageId, message,
		);
	},

	getTf(adapterId = DEFAULT_ADAPTER_ID) {
		const resolved = instances.get(adapterId);
		if (!resolved) {
			throw new TypeError(`Unknown adapter: ${adapterId}.`);
		}
		return resolved.adapter.getTf(resolved.instance);
	},

	applyRotation(vector, rotation, inverse, adapterId = DEFAULT_ADAPTER_ID) {
		return this.getTf(adapterId).applyRotation(vector, rotation, inverse);
	},

	listNodes(adapterConfiguration) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.listNodes(resolved.instance, adapterConfiguration.values || {});
	},

	getNodeParameters(adapterConfiguration, node) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.getNodeParameters(resolved.instance, adapterConfiguration.values || {}, node);
	},

	setNodeParameter(adapterConfiguration, node, name, value) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.setNodeParameter(
			resolved.instance, adapterConfiguration.values || {}, node, name, value,
		);
	},

	recordingStatus(adapterConfiguration) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.recordingStatus(resolved.instance, adapterConfiguration.values || {});
	},

	setRecording(adapterConfiguration, request) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.setRecording(resolved.instance, adapterConfiguration.values || {}, request);
	},

	commandShortcuts(adapterConfiguration) {
		const resolved = resolveAdapterConfiguration(adapterConfiguration);
		return resolved.adapter.commandShortcuts(resolved.instance, adapterConfiguration.values || {});
	},
});
