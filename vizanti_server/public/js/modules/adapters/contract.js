// Every adapter represents one protocol. The endpoint service registers each
// adapter under its adapterId, such as "ros2". Endpoint fields and native
// message formats remain owned by the adapter.
//
// Adapter methods:
// - configurationFields() describes the fields needed to configure the adapter
// - endpointFields(endpointType, guiMessageType) describes the fields needed
//   by a plugin endpoint. The editor currently supports `message`, `endpoint`,
//   and `text` controls.
// - allowsDiscovery(endpointType, guiMessageType) declares whether the adapter
//   can discover endpoints for that operation. When false, the editor renders
//   only the adapter's manual endpoint input.
// - discoverEndpoints(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, endpointValues) returns endpoint descriptors. Without a
//   GUI-message filter, topic descriptors remain available for raw browsing.
// - subscribeRaw(instance, configuration, endpoint, onMessage, deliveryOptions)
//   returns { unsubscribe() } for a protocol-native topic payload.
// - getTopicInfo(instance, configuration, endpoint) returns adapter-owned
//   metadata about a topic, such as publishers and subscribers.
// - listOutputMessages(guiMessageType) resolves native format choices
// - createManualEndpoint(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, address, endpointValues) converts manually entered text
//   into an adapter-native endpoint
// - restoreEndpoint(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, endpointId, endpointValues) restores an endpoint
// - getTf(instance) returns the adapter's transform service
// - subscribe(instance, configuration, endpoint, guiMessageType, outputMessageId,
//   onMessage, deliveryOptions) returns { unsubscribe() }. deliveryOptions are
//   protocol-neutral delivery preferences such as throttleRate and queueLength.
// - publish(instance, configuration, endpoint, outputMessageId, guiMessage)
//   sends one GUI message
// - call(instance, configuration, endpoint, guiRequest) resolves with one response
// - recordingStatus(instance, configuration) returns the active recording state
// - setRecording(instance, configuration, request) starts or stops a recording
// - commandShortcuts(instance, configuration) returns adapter-provided command
//   prefixes for the Shell widget

export const ENDPOINT_TYPE = Object.freeze({
	TOPIC: "topic",
	SERVICE: "service",
});

export const ADAPTER_OPERATION = Object.freeze({
	CONFIGURATION_FIELDS: "configurationFields",
	ENDPOINT_FIELDS: "endpointFields",
	SUPPORTS: "supports",
	ALLOWS_DISCOVERY: "allowsDiscovery",
	DISCOVER_ENDPOINTS: "discoverEndpoints",
	SUBSCRIBE_RAW: "subscribeRaw",
	GET_TOPIC_INFO: "getTopicInfo",
	GET_TF: "getTf",
	SUBSCRIBE: "subscribe",
	PUBLISH: "publish",
	CALL: "call",
	CREATE_MANUAL_ENDPOINT: "createManualEndpoint",
	LIST_OUTPUT_MESSAGES: "listOutputMessages",
	RESTORE_ENDPOINT: "restoreEndpoint",
	LIST_NODES: "listNodes",
	GET_NODE_PARAMETERS: "getNodeParameters",
	SET_NODE_PARAMETER: "setNodeParameter",
	RECORDING_STATUS: "recordingStatus",
	SET_RECORDING: "setRecording",
	COMMAND_SHORTCUTS: "commandShortcuts",
});

export function assertAdapterContract(adapter) {
	if (!adapter || typeof adapter.id !== "string" || adapter.id.trim() === "") {
		throw new TypeError("An adapter must have a non-empty id.");
	}

	for (const operation of Object.values(ADAPTER_OPERATION)) {
		if (typeof adapter[operation] !== "function") {
			throw new TypeError(`Adapter ${adapter.id} must implement ${operation}().`);
		}
	}

	return Object.freeze(adapter);
}
