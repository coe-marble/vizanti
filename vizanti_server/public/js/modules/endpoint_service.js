import { localRos2Instance, ros2Adapter } from './adapters/ros2.js';

const instances = new Map([
	[localRos2Instance.id, { instance: localRos2Instance, adapter: ros2Adapter, label: "ROS2" }],
]);

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
	listAdapters(guiMessageType) {
		return [...instances.entries()]
			.filter(([, value]) => guiMessageType === undefined || value.adapter.supports(guiMessageType))
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

	listOutputMessages(adapterId, guiMessageType) {
		const resolved = instances.get(adapterId);
		return resolved && resolved.adapter.supports(guiMessageType)
			? resolved.adapter.listOutputMessages(guiMessageType) : [];
	},

	async listEndpoints(adapterId, adapterValues, guiMessageType, outputMessageId) {
		const resolved = instances.get(adapterId);
		if (!resolved || !resolved.adapter.supports(guiMessageType)) {
			return [];
		}
		return resolved.adapter.listEndpoints(resolved.instance, adapterValues || {}, guiMessageType, outputMessageId);
	},

	createManualEndpoint(adapterId, adapterValues, guiMessageType, outputMessageId, address) {
		const resolved = instances.get(adapterId);
		if (!resolved || !resolved.adapter.supports(guiMessageType)) {
			return null;
		}
		return resolved.adapter.createManualEndpoint(
			resolved.instance, adapterValues || {}, guiMessageType, outputMessageId, address,
		);
	},

	async restoreEndpoint(adapterId, adapterValues, guiMessageType, outputMessageId, endpointId) {
		const resolved = instances.get(adapterId);
		if (!resolved || !resolved.adapter.supports(guiMessageType)) {
			return null;
		}
		return resolved.adapter.restoreEndpoint(resolved.instance, adapterValues || {}, guiMessageType, outputMessageId, endpointId);
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
});
