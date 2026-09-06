import { localRos2Instance, ros2Adapter } from './adapters/ros2.js';

const instances = new Map([
	[localRos2Instance.id, { instance: localRos2Instance, adapter: ros2Adapter, label: "ROS2" }],
]);
const DEFAULT_ADAPTER_ID = "ros2";

function resolve(configuration) {
	if (!configuration || typeof configuration.adapterId !== "string") {
		throw new TypeError("Endpoint configuration must select an adapter.");
	}
	const resolved = instances.get(configuration.adapterId);
	if (!resolved) {
		throw new TypeError(`Unknown adapter: ${configuration.adapterId}.`);
	}
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

	async listEndpoints(adapterId, adapterValues, endpointType, guiMessageType, outputMessageId, endpointValues) {
		const resolved = instances.get(adapterId);
		if (!resolved || !resolved.adapter.allowsDiscovery(endpointType, guiMessageType)) {
			return [];
		}
		return resolved.adapter.listEndpoints(
			resolved.instance, adapterValues || {}, endpointType, guiMessageType,
			outputMessageId, endpointValues || {},
		);
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

	subscribe(configuration, guiMessageType, onMessage) {
		const resolved = resolve(configuration);
		return resolved.adapter.subscribe(
			resolved.instance, configuration.adapterValues || {}, configuration.endpoint,
			guiMessageType, configuration.outputMessageId, onMessage,
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
});
