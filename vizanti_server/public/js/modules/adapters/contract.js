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
// - listOutputMessages(guiMessageType) resolves native format choices
// - listEndpoints(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, endpointValues) resolves endpoints
// - createManualEndpoint(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, address, endpointValues) converts manually entered text
//   into an adapter-native endpoint
// - restoreEndpoint(instance, configuration, endpointType, guiMessageType,
//   outputMessageId, endpointId, endpointValues) restores an endpoint
// - getTf(instance) returns the adapter's transform service
// - subscribe(instance, configuration, endpoint, guiMessageType, onMessage) returns { unsubscribe() }
// - publish(instance, configuration, endpoint, guiMessage) sends one GUI message
// - call(instance, configuration, endpoint, request) resolves with one response

export const ENDPOINT_TYPE = Object.freeze({
	TOPIC: "topic",
	SERVICE: "service",
});

export const ADAPTER_OPERATION = Object.freeze({
	CONFIGURATION_FIELDS: "configurationFields",
	ENDPOINT_FIELDS: "endpointFields",
	SUPPORTS: "supports",
	ALLOWS_DISCOVERY: "allowsDiscovery",
	GET_TF: "getTf",
	SUBSCRIBE: "subscribe",
	PUBLISH: "publish",
	CALL: "call",
	LIST_ENDPOINTS: "listEndpoints",
	CREATE_MANUAL_ENDPOINT: "createManualEndpoint",
	LIST_OUTPUT_MESSAGES: "listOutputMessages",
	RESTORE_ENDPOINT: "restoreEndpoint",
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
