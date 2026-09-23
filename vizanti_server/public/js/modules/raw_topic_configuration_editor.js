import { createAdapterConfigurationEditor } from "./adapter_configuration_editor.js";

function initialValue(configuration) {
	const source = configuration || {};
	return {
		adapterId: typeof source.adapterId === "string" ? source.adapterId : "",
		adapterValues: { ...(source.adapterValues || {}) },
		endpointType: "topic",
		endpointMode: source.endpointMode === "manual" ? "manual" : "select",
		endpointId: typeof source.endpointId === "string" ? source.endpointId : "",
		manualEndpointId: typeof source.manualEndpointId === "string" ? source.manualEndpointId : "",
		manualMessageType: typeof source.manualMessageType === "string" ? source.manualMessageType : "",
		endpoint: source.endpoint || null,
	};
}

// Configures an adapter and an arbitrary topic without imposing a stable GUI
// message schema. Inspector is the intended consumer: it renders protocol
// payloads through adapter-owned raw subscription support.
export function createRawTopicConfiguration({
	container,
	endpointService,
	configuration = null,
	onChange = () => {},
}) {
	let value = initialValue(configuration);
	let discoveredTopics = [];
	let suppressAdapterRefresh = true;

	const root = document.createElement("div");
	root.className = "raw-topic-configuration";
	container.appendChild(root);
	const adapterContainer = document.createElement("div");
	const topicContainer = document.createElement("div");
	const topicSelector = document.createElement("select");
	const manualToggle = document.createElement("input");
	manualToggle.type = "checkbox";
	const manualTopic = document.createElement("input");
	manualTopic.type = "text";
	manualTopic.placeholder = "Topic name";
	const manualMessageType = document.createElement("input");
	manualMessageType.type = "text";
	manualMessageType.placeholder = "Adapter message type";
	const manualFields = document.createElement("div");

	function addField(label, control, parent = topicContainer) {
		const row = document.createElement("div");
		row.className = "configuration-field";
		const labelElement = document.createElement("label");
		labelElement.textContent = label;
		row.appendChild(labelElement);
		row.appendChild(control);
		parent.appendChild(row);
		return row;
	}

	function emitChange() {
		onChange({ ...value, adapterValues: { ...value.adapterValues } });
	}

	function setManualEndpoint() {
		const topic = manualTopic.value.trim();
		const messageType = manualMessageType.value.trim();
		value = {
			...value,
			endpointMode: "manual",
			manualEndpointId: topic,
			manualMessageType: messageType,
			endpointId: topic,
			endpoint: topic !== "" && messageType !== ""
				? { topic, nativeMessageType: messageType } : null,
		};
		emitChange();
	}

	function renderTopicOptions() {
		topicSelector.innerHTML = "";
		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.textContent = "Select a topic";
		topicSelector.appendChild(placeholder);

		const configuredId = value.endpointId || (value.endpoint && value.endpoint.topic) || "";
		const topics = [...discoveredTopics];
		if (configuredId !== "" && !topics.some((topic) => topic.id === configuredId)) {
			topics.push({
				id: configuredId,
				label: configuredId,
				messageType: value.endpoint && value.endpoint.nativeMessageType || "",
			});
		}
		for (const topic of topics) {
			const option = document.createElement("option");
			option.value = topic.id;
			option.textContent = `${topic.label} (${topic.messageType})`;
			topicSelector.appendChild(option);
		}
		topicSelector.value = configuredId;
	}

	function renderMode() {
		const manual = value.endpointMode === "manual";
		manualToggle.checked = manual;
		topicSelector.hidden = manual;
		manualFields.hidden = !manual;
		manualTopic.value = value.manualEndpointId || (manual && value.endpoint && value.endpoint.topic) || "";
		manualMessageType.value = value.manualMessageType
			|| (manual && value.endpoint && value.endpoint.nativeMessageType) || "";
	}

	async function refreshTopics() {
		discoveredTopics = await endpointService.discoverEndpoints({
			adapterConfiguration: {
				adapterId: value.adapterId,
				values: value.adapterValues,
			},
		});
		renderTopicOptions();
		renderMode();
	}

	root.appendChild(adapterContainer);
	addField("Topic:", topicSelector);
	const manualLabel = document.createElement("label");
	manualLabel.appendChild(manualToggle);
	manualLabel.appendChild(document.createTextNode(" Enter manually"));
	addField("", manualLabel);
	addField("Topic:", manualTopic, manualFields);
	addField("Message type:", manualMessageType, manualFields);
	topicContainer.appendChild(manualFields);
	root.appendChild(topicContainer);

	const adapterEditor = createAdapterConfigurationEditor({
		container: adapterContainer,
		endpointService,
		configuration: value.adapterId === "" ? null : {
			adapterId: value.adapterId,
			values: value.adapterValues,
		},
		onChange(adapterConfiguration) {
			const adapterChanged = value.adapterId !== "" && value.adapterId !== adapterConfiguration.adapterId;
			value = {
				...value,
				adapterId: adapterConfiguration.adapterId,
				adapterValues: { ...adapterConfiguration.values },
				...(adapterChanged ? {
					endpointMode: "select", endpointId: "", manualEndpointId: "",
					manualMessageType: "", endpoint: null,
				} : {}),
			};
			emitChange();
			if (!suppressAdapterRefresh) {
				refreshTopics();
			}
		},
	});

	topicSelector.addEventListener("change", () => {
		const selected = discoveredTopics.find((topic) => topic.id === topicSelector.value);
		value = {
			...value,
			endpointMode: "select",
			endpointId: selected ? selected.id : "",
			endpoint: selected ? { topic: selected.id, nativeMessageType: selected.messageType } : null,
		};
		emitChange();
	});
	manualToggle.addEventListener("change", () => {
		value = { ...value, endpointMode: manualToggle.checked ? "manual" : "select" };
		renderMode();
		if (manualToggle.checked) {
			setManualEndpoint();
		} else {
			emitChange();
		}
	});
	manualTopic.addEventListener("input", setManualEndpoint);
	manualMessageType.addEventListener("input", setManualEndpoint);

	return Object.freeze({
		async refresh() {
			suppressAdapterRefresh = true;
			adapterEditor.refresh();
			suppressAdapterRefresh = false;
			await refreshTopics();
		},
		get activeConfiguration() {
			if (!value.adapterId || !value.endpoint) return null;
			return { ...value, adapterValues: { ...value.adapterValues } };
		},
	});
}
