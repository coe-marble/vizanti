import '../../lib/roslib.min.js';
import { rosbridge } from '../rosbridge.js';
import { ENDPOINT_TYPE, assertAdapterContract } from './contract.js';
import { GUI_MESSAGE_TYPE, createFloat, createPose } from '../gui_messages.js';
import { createRosTf } from './tf_ros.js';

const floatMappings = Object.freeze({
	"std_msgs/msg/Float32": Object.freeze({
		fromNative(message) { return createFloat(message.data); },
		toNative(message) { return { data: message.value }; },
	}),
	"std_msgs/msg/Float64": Object.freeze({
		fromNative(message) { return createFloat(message.data); },
		toNative(message) { return { data: message.value }; },
	}),
});

const poseMappings = Object.freeze({
	"geometry_msgs/msg/Pose": Object.freeze({
		fromNative(message) {
			return createPose({ frameId: "", position: message.position, orientation: message.orientation, stamp: { sec: 0, nanosec: 0 } });
		},
		toNative(message) { return { position: message.position, orientation: message.orientation }; },
	}),
	"geometry_msgs/msg/PoseStamped": Object.freeze({
		fromNative(message) {
			return createPose({
				frameId: message.header.frame_id,
				position: message.pose.position,
				orientation: message.pose.orientation,
				stamp: message.header.stamp,
			});
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				position: message.position, orientation: message.orientation,
			} };
		},
	}),
	"geometry_msgs/msg/PoseWithCovarianceStamped": Object.freeze({
		fromNative(message) {
			return createPose({ frameId: message.header.frame_id, position: message.pose.pose.position, orientation: message.pose.pose.orientation, stamp: message.header.stamp });
		},
		toNative(message) {
			return { header: { stamp: message.stamp, frame_id: message.frameId }, pose: {
				pose: { position: message.position, orientation: message.orientation }, covariance: Array(36).fill(0),
			} };
		},
	}),
});

function mappingsFor(guiMessageType) {
	if (guiMessageType === GUI_MESSAGE_TYPE.FLOAT) return floatMappings;
	if (guiMessageType === GUI_MESSAGE_TYPE.POSE) return poseMappings;
	return null;
}

function normalizedNamespace(configuration) {
	const namespace = configuration && typeof configuration.namespace === "string"
		? configuration.namespace.trim().replace(/\/+$/g, "") : "";
	if (!namespace || namespace === "/") return "";
	return namespace.startsWith("/") ? namespace : `/${namespace}`;
}

function belongsToNamespace(topic, configuration) {
	const namespace = normalizedNamespace(configuration);
	return namespace === "" || topic === namespace || topic.startsWith(`${namespace}/`);
}

function resolveEndpointAddress(address, configuration) {
	const endpoint = typeof address === "string" ? address.trim() : "";
	if (endpoint === "") return "";
	if (endpoint.startsWith("/")) return endpoint;
	const namespace = normalizedNamespace(configuration);
	return namespace === "" ? `/${endpoint}` : `${namespace}/${endpoint}`;
}

function requireEndpointString(endpoint, field) {
	if (!endpoint || typeof endpoint[field] !== "string" || endpoint[field].trim() === "") {
		throw new TypeError(`ROS2 endpoint.${field} must be a non-empty string.`);
	}

	return endpoint[field];
}

function createTopicOptions(client, endpoint) {
	const options = {
		ros: client.ros,
		name: requireEndpointString(endpoint, "topic"),
		messageType: requireEndpointString(endpoint, "messageType"),
	};

	if (endpoint.compression !== undefined) {
		options.compression = endpoint.compression;
	}
	if (endpoint.throttleRate !== undefined) {
		options.throttle_rate = endpoint.throttleRate;
	}
	if (endpoint.queueLength !== undefined) {
		options.queue_length = endpoint.queueLength;
	}

	return options;
}

function createServiceOptions(client, endpoint) {
	return {
		ros: client.ros,
		name: requireEndpointString(endpoint, "service"),
		serviceType: requireEndpointString(endpoint, "serviceType"),
	};
}

// The current dashboard has one ROS2 adapter.
export const localRos2Instance = Object.freeze({
	id: "ros2",
});

export function createRos2Adapter({ ROSLIB: roslib, getClient, createTf }) {
	if (!roslib || typeof roslib.Topic !== "function" || typeof roslib.Service !== "function") {
		throw new TypeError("ROS2 adapter requires ROSLIB Topic and Service constructors.");
	}
	if (typeof getClient !== "function") {
		throw new TypeError("ROS2 adapter requires a client resolver.");
	}
	if (typeof createTf !== "function") {
		throw new TypeError("ROS2 adapter requires a TF service factory.");
	}
	let tf = null;

	return assertAdapterContract({
		id: "ros2",
		configurationFields() {
			return [
				{
					id: "namespace",
					label: "Namespace",
					type: "text",
					placeholder: "/robot_1",
					defaultValue: "",
				},
				{
					id: "tfFrame",
					label: "TF frame",
					type: "text",
					placeholder: "base_link",
					defaultValue: "base_link",
				},
			];
		},
		supports(guiMessageType) {
			return mappingsFor(guiMessageType) !== null;
		},

		endpointFields(endpointType, guiMessageType) {
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				return [
					{ id: "serviceType", label: "Service Type", control: "text", placeholder: "package_name/srv/Service" },
					{
						id: "endpointId", label: "Service", control: "endpoint",
						manual: { label: "Enter manually", placeholder: "Service name" },
					},
				];
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC || !this.supports(guiMessageType)) {
				return [];
			}

			return [
				{ id: "outputMessageId", label: "Message", control: "message" },
				{
					id: "endpointId", label: "Topic", control: "endpoint",
					manual: { label: "Enter manually", placeholder: "Topic name" },
				},
			];
		},

		allowsDiscovery(endpointType, guiMessageType) {
			return endpointType === ENDPOINT_TYPE.SERVICE
				|| (endpointType === ENDPOINT_TYPE.TOPIC && this.supports(guiMessageType));
		},

		getTf(instance) {
			if (!tf) {
				const client = getClient(instance);
				tf = createTf({ ROSLIB: roslib, ros: client.ros, compression: client.compression });
			}
			return tf;
		},

		listOutputMessages(guiMessageType) {
			const mappings = mappingsFor(guiMessageType);
			return mappings ? Object.keys(mappings).map((id) => ({ id, label: id })) : [];
		},

		async listEndpoints(instance, configuration, endpointType, guiMessageType, outputMessageId, endpointValues) {
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				const serviceType = endpointValues && typeof endpointValues.serviceType === "string"
					? endpointValues.serviceType.trim() : "";
				if (serviceType === "") return [];
				const services = await getClient(instance).get_services(serviceType);
				return services.filter((service) => belongsToNamespace(service, configuration)).map((service) => ({
					id: service,
					label: service,
					endpoint: { service, serviceType },
				}));
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC || !this.supports(guiMessageType)) return [];
			const result = await getClient(instance).get_all_topics();
			const mappings = mappingsFor(guiMessageType);
			if (!mappings[outputMessageId]) return [];
			return result.topics.map((topic, index) => ({
				id: topic,
				label: `${topic} (${result.types[index]})`,
				endpoint: { topic, nativeMessageType: result.types[index] },
			})).filter((endpoint) => endpoint.endpoint.nativeMessageType === outputMessageId)
				.filter((endpoint) => belongsToNamespace(endpoint.id, configuration));
		},

		createManualEndpoint(instance, configuration, endpointType, guiMessageType, outputMessageId, address, endpointValues) {
			const endpointId = typeof address === "string" ? address.trim() : "";
			if (endpointType === ENDPOINT_TYPE.SERVICE) {
				const serviceType = endpointValues && typeof endpointValues.serviceType === "string"
					? endpointValues.serviceType.trim() : "";
				if (endpointId === "" || serviceType === "") return null;
				return {
					id: endpointId,
					label: endpointId,
					endpoint: { service: resolveEndpointAddress(endpointId, configuration), serviceType },
				};
			}

			if (endpointType !== ENDPOINT_TYPE.TOPIC) return null;
			const mappings = mappingsFor(guiMessageType);
			if (!mappings || !mappings[outputMessageId] || endpointId === "") {
				return null;
			}
			return {
				id: endpointId,
				label: endpointId,
				endpoint: {
					topic: resolveEndpointAddress(endpointId, configuration),
					nativeMessageType: outputMessageId,
				},
			};
		},

		async restoreEndpoint(instance, configuration, endpointType, guiMessageType, outputMessageId, endpointId, endpointValues) {
			if (typeof endpointId !== "string" || endpointId === "") {
				return null;
			}
			const endpoints = await this.listEndpoints(
				instance, configuration, endpointType, guiMessageType, outputMessageId, endpointValues,
			);
			return endpoints.find((endpoint) => endpoint.id === endpointId) || null;
		},

		subscribe(instance, configuration, endpoint, guiMessageType, outputMessageId, onMessage) {
			const mappings = mappingsFor(guiMessageType);
			const mapping = mappings && mappings[outputMessageId];
			if (!this.supports(guiMessageType) || !mapping || typeof onMessage !== "function") {
				throw new TypeError("ROS2 subscriptions require a message callback.");
			}

			const topic = new roslib.Topic(createTopicOptions(getClient(instance), {
				topic: endpoint.topic,
				messageType: endpoint.nativeMessageType,
			}));
			const onNativeMessage = (message) => onMessage(mapping.fromNative(message));
			topic.subscribe(onNativeMessage);
			return Object.freeze({
				unsubscribe() {
					topic.unsubscribe(onNativeMessage);
				},
			});
		},

		publish(instance, configuration, endpoint, outputMessageId, message) {
			const mappings = mappingsFor(message && message.type);
			const mapping = mappings && mappings[outputMessageId];
			if (!mapping) {
				throw new TypeError("ROS2 endpoint does not support this GUI message type.");
			}
			const topic = new roslib.Topic(createTopicOptions(getClient(instance), {
				topic: endpoint.topic,
				messageType: endpoint.nativeMessageType,
			}));
			topic.publish(new roslib.Message(mapping.toNative(message)));
			topic.unadvertise();
		},

		call(instance, configuration, endpoint, request) {
			const service = new roslib.Service(createServiceOptions(getClient(instance), endpoint));
			return new Promise((resolve, reject) => {
				service.callService(new roslib.ServiceRequest(request), resolve, reject);
			});
		},
	});
}

export const ros2Adapter = createRos2Adapter({
	ROSLIB,
	createTf: createRosTf,
	getClient(instance) {
		if (!instance || instance.id !== localRos2Instance.id) {
			throw new TypeError("Unknown ROS2 adapter instance.");
		}
		return rosbridge;
	},
});
