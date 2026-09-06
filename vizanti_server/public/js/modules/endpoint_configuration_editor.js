import { ENDPOINT_TYPE } from "./adapters/contract.js";
import { createAdapterConfigurationEditor } from "./adapter_configuration_editor.js";

// Renders the endpoint fields declared by an adapter. In manual mode it also
// renders an adapter configuration. With a fixed adapter configuration, for
// example from a Robot Model, it renders only the plugin-owned choices.
export function createEndpointConfigurationEditor({
	container,
	endpointService,
	guiMessageType,
	endpointType = ENDPOINT_TYPE.TOPIC,
	configuration = null,
	fixedAdapterConfiguration = null,
	onChange = () => {},
}) {
	let value = configuration;
	let fixedAdapter = fixedAdapterConfiguration;
	const form = document.createElement("fieldset");
	form.className = "endpoint-configuration";
	const title = document.createElement("legend");
	title.textContent = "Endpoint Configuration";
	form.appendChild(title);
	container.appendChild(form);

	const adapter = document.createElement("select");
	const adapterFields = document.createElement("div");
	const endpointFieldsContainer = document.createElement("div");
	const outputMessage = document.createElement("select");
	const endpoint = document.createElement("select");
	const manualEndpointToggle = document.createElement("input");
	manualEndpointToggle.type = "checkbox";
	const manualEndpointInput = document.createElement("input");
	manualEndpointInput.type = "text";
	manualEndpointInput.placeholder = "";

	function addField(label, control, parent = form, className = "") {
		const row = document.createElement("div");
		row.className = `configuration-field ${className}`.trim();
		if (label !== "") {
			const labelElement = document.createElement("label");
			labelElement.textContent = label;
			row.appendChild(labelElement);
		}
		row.appendChild(control);
		parent.appendChild(row);
		return row;
	}

	function defaults(adapterId) {
		return endpointService.configurationFields(adapterId).reduce((values, field) => {
			values[field.id] = field.defaultValue || "";
			return values;
		}, {});
	}

	function currentAdapterId() {
		return fixedAdapter ? fixedAdapter.adapterId : value.adapterId;
	}

	function currentAdapterValues() {
		return fixedAdapter ? fixedAdapter.values : value.adapterValues;
	}

	function completeValue() {
		return {
			...value,
			endpointType,
			adapterId: currentAdapterId(),
			adapterValues: { ...(currentAdapterValues() || {}) },
		};
	}

	function emitChange() {
		onChange(completeValue());
	}

	function renderOptions(control, options, selectedId, disabledLabel = null) {
		control.innerHTML = "";
		if (disabledLabel !== null) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = disabledLabel;
			control.appendChild(option);
		}
		for (const item of options) {
			const option = document.createElement("option");
			option.value = item.id;
			option.textContent = item.label;
			control.appendChild(option);
		}
		control.value = selectedId || "";
	}

	function renderAdapterFields() {
		adapterFields.innerHTML = "";
		for (const field of endpointService.configurationFields(currentAdapterId())) {
			const input = document.createElement("input");
			input.type = field.type || "text";
			input.placeholder = field.placeholder || "";
			input.value = currentAdapterValues()[field.id] || field.defaultValue || "";
			input.addEventListener("input", () => {
				value = {
					...value,
					adapterValues: { ...value.adapterValues, [field.id]: input.value },
				};
				emitChange();
			});
			addField(`${field.label}:`, input, adapterFields);
		}
	}

	function endpointFields() {
		return endpointService.endpointFields(currentAdapterId(), endpointType, guiMessageType);
	}

	function hasEndpointControl() {
		return endpointFields().some((field) => field.control === "endpoint");
	}

	function hasMessageControl() {
		return endpointFields().some((field) => field.control === "message");
	}

	function renderEndpointFields() {
		endpointFieldsContainer.innerHTML = "";
		for (const field of endpointFields()) {
			if (field.control === "message") {
				addField(`${field.label}:`, outputMessage, endpointFieldsContainer);
				continue;
			}

			if (field.control === "endpoint") {
				addField(`${field.label}:`, endpoint, endpointFieldsContainer);
				if (!field.manual) continue;

				manualEndpointInput.placeholder = field.manual.placeholder || "";
				const manualToggleLabel = document.createElement("label");
				manualToggleLabel.appendChild(manualEndpointToggle);
				manualToggleLabel.appendChild(document.createTextNode(` ${field.manual.label}`));
				const manualEndpointControl = document.createElement("div");
				manualEndpointControl.className = "configuration-manual-endpoint";
				manualEndpointControl.appendChild(manualToggleLabel);
				manualEndpointControl.appendChild(manualEndpointInput);
				addField("", manualEndpointControl, endpointFieldsContainer, "configuration-manual-toggle");
				continue;
			}

			if (field.control === "text") {
				const input = document.createElement("input");
				input.type = "text";
				input.placeholder = field.placeholder || "";
				input.value = value[field.id] || field.defaultValue || "";
				input.addEventListener("input", () => {
					value = { ...value, [field.id]: input.value };
					emitChange();
				});
				addField(`${field.label}:`, input, endpointFieldsContainer);
				continue;
			}

			throw new TypeError(`Unsupported endpoint field control: ${field.control}.`);
		}
	}

	function renderManualEndpointInput() {
		const manual = value.endpointMode === "manual";
		manualEndpointToggle.checked = manual;
		manualEndpointInput.hidden = !manual;
		endpoint.disabled = manual;
		manualEndpointInput.value = value.manualEndpointId || "";
	}

	async function applyManualEndpoint() {
		const endpointId = manualEndpointInput.value.trim();
		const created = endpointService.createManualEndpoint(
			currentAdapterId(), currentAdapterValues(), guiMessageType, value.outputMessageId, endpointId,
		);
		value = {
			...value,
			endpointMode: "manual",
			manualEndpointId: endpointId,
			endpointId: created ? created.id : endpointId,
			endpoint: created ? created.endpoint : null,
		};
		emitChange();
	}

	async function refreshEndpoints() {
		if (!hasEndpointControl()) {
			return;
		}
		const choices = await endpointService.listEndpoints(
			currentAdapterId(), currentAdapterValues(), guiMessageType, value.outputMessageId,
		);
		if (value.endpointMode === "manual") {
			renderOptions(endpoint, choices, "", "(Disabled)");
			renderManualEndpointInput();
			await applyManualEndpoint();
			return;
		}

		let selected = choices.find((choice) => choice.id === value.endpointId);
		if (!selected && value.endpointId && value.endpoint) {
			// Topic discovery can be temporarily empty while ROS reconnects. Keep
			// the saved endpoint usable instead of replacing the saved setting.
			selected = {
				id: value.endpointId,
				label: value.endpointId,
				endpoint: value.endpoint,
			};
			choices.push(selected);
		}
		value = {
			...value,
			endpointMode: "select",
			endpointId: selected ? selected.id : "",
			endpoint: selected ? selected.endpoint : null,
		};
		renderOptions(endpoint, choices, value.endpointId, "(Disabled)");
		renderManualEndpointInput();
		emitChange();
	}

	async function refreshOutputMessages() {
		if (!hasMessageControl()) {
			await refreshEndpoints();
			return;
		}
		const choices = endpointService.listOutputMessages(currentAdapterId(), guiMessageType);
		if (!choices.some((choice) => choice.id === value.outputMessageId)) {
			value = { ...value, outputMessageId: choices.length ? choices[0].id : "", endpointId: "", endpoint: null };
		}
		renderOptions(outputMessage, choices, value.outputMessageId);
		await refreshEndpoints();
	}

	async function refresh() {
		if (fixedAdapter) {
			if (!fixedAdapter.adapterId) {
				value = { outputMessageId: "", endpointId: "", endpoint: null, endpointMode: "select" };
				return;
			}
			value = { ...(value || {}), adapterId: fixedAdapter.adapterId, adapterValues: { ...fixedAdapter.values } };
		} else {
			const adapters = endpointService.listAdapters(guiMessageType);
			if (!value || !adapters.some((item) => item.id === value.adapterId)) {
				const adapterId = adapters[0] ? adapters[0].id : "";
				value = {
					adapterId,
					adapterValues: defaults(adapterId),
					outputMessageId: "",
					endpointId: "",
					endpoint: null,
					endpointMode: "select",
				};
			}
			renderOptions(adapter, adapters, value.adapterId);
			renderAdapterFields();
		}
		renderEndpointFields();
		await refreshOutputMessages();
	}

	if (!fixedAdapter) {
		addField("Adapter:", adapter);
		form.appendChild(adapterFields);
		adapter.addEventListener("change", async () => {
			value = {
				adapterId: adapter.value,
				adapterValues: defaults(adapter.value),
				outputMessageId: "",
				endpointId: "",
				endpoint: null,
				endpointMode: "select",
			};
			renderAdapterFields();
			renderEndpointFields();
			await refreshOutputMessages();
		});
	}

	form.appendChild(endpointFieldsContainer);

	outputMessage.addEventListener("change", async () => {
		value = { ...value, outputMessageId: outputMessage.value, endpointId: "", endpoint: null };
		await refreshEndpoints();
	});
	endpoint.addEventListener("change", async () => {
		const choices = await endpointService.listEndpoints(
			currentAdapterId(), currentAdapterValues(), guiMessageType, value.outputMessageId,
		);
		const selected = choices.find((choice) => choice.id === endpoint.value);
		value = {
			...value,
			endpointMode: "select",
			endpointId: selected ? selected.id : "",
			endpoint: selected ? selected.endpoint : null,
		};
		renderManualEndpointInput();
		emitChange();
	});
	manualEndpointToggle.addEventListener("change", async () => {
		if (manualEndpointToggle.checked) {
			value = { ...value, endpointMode: "manual", manualEndpointId: value.manualEndpointId || "" };
		} else {
			value = { ...value, endpointMode: "select", endpointId: "", endpoint: null };
		}
		await refreshEndpoints();
	});
	manualEndpointInput.addEventListener("input", applyManualEndpoint);

	return Object.freeze({
		refresh,
		setAdapterConfiguration(configuration) {
			fixedAdapter = configuration;
			return refresh();
		},
		get value() { return completeValue(); },
	});
}

function adapterConfigurationOf(configuration) {
	if (!configuration || typeof configuration.adapterId !== "string") {
		return null;
	}
	return {
		adapterId: configuration.adapterId,
		values: { ...(configuration.values || configuration.adapterValues || {}) },
	};
}

function endpointConfigurationOf(configuration) {
	if (!configuration) {
		return null;
	}
	const { adapterId, adapterValues, endpointType, ...endpointConfiguration } = configuration;
	return endpointConfiguration;
}

function initialConfiguration(configuration) {
	const source = configuration || {};
	const mode = source.mode === "robotmodel" ? "robotmodel" : "manual";
	const legacyEndpoint = mode === "robotmodel" ? source.robotModel : source.manual;

	return {
		mode,
		robotModelId: source.robotModelId || "",
		manualAdapterConfiguration: adapterConfigurationOf(source.manualAdapterConfiguration)
			|| adapterConfigurationOf(source.manual),
		endpointConfiguration: endpointConfigurationOf(source.endpointConfiguration)
			|| endpointConfigurationOf(legacyEndpoint),
	};
}

// Renders one plugin-owned endpoint configuration. The selected mode only
// changes where the adapter configuration comes from: the Manual fields or a
// Robot Model. The message format and endpoint are shared by both modes.
export function createEndpointConfiguration({
	container,
	endpointService,
	guiMessageType,
	endpointType = ENDPOINT_TYPE.TOPIC,
	configuration = null,
	getRobotModels = () => [],
	onChange = () => {},
}) {
	let value = initialConfiguration(configuration);
	const root = document.createElement("div");
	root.className = "endpoint-configuration-selector";
	container.appendChild(root);
	const mode = document.createElement("select");
	const manual = document.createElement("div");
	const robotModel = document.createElement("div");
	const robotModelSelector = document.createElement("select");
	const manualContainer = document.createElement("div");
	const endpointContainer = document.createElement("div");
	let endpointEditor = null;
	let initializingManualAdapter = true;

	function addField(label, control, parent = root) {
		const row = document.createElement("div");
		row.className = "configuration-field";
		const labelElement = document.createElement("label");
		labelElement.textContent = label;
		row.appendChild(labelElement);
		row.appendChild(control);
		parent.appendChild(row);
	}

	function emitChange() {
		onChange(value);
	}

	function selectedRobotModel() {
		return getRobotModels().find((robot) => robot.id === value.robotModelId) || null;
	}

	function activeAdapterConfiguration() {
		if (value.mode === "manual") {
			return value.manualAdapterConfiguration;
		}
		const robot = selectedRobotModel();
		return robot ? adapterConfigurationOf(robot.adapterConfiguration) : null;
	}

	function renderRobotModels() {
		robotModelSelector.innerHTML = "<option value=''>Select Robot Model</option>";
		for (const robot of getRobotModels()) {
			const option = document.createElement("option");
			option.value = robot.id;
			option.textContent = robot.name;
			robotModelSelector.appendChild(option);
		}
		robotModelSelector.value = value.robotModelId;
	}

	function updateMode() {
		const usesRobotModel = value.mode === "robotmodel";
		mode.value = value.mode;
		manual.hidden = usesRobotModel;
		robotModel.hidden = !usesRobotModel;
		robotModelSelector.disabled = !usesRobotModel;
	}

	async function refreshEndpoint() {
		if (!endpointEditor) {
			return;
		}
		const adapterConfiguration = activeAdapterConfiguration();
		if (!adapterConfiguration || !adapterConfiguration.adapterId) {
			return;
		}
		await endpointEditor.setAdapterConfiguration(adapterConfiguration);
	}

	addField("Configuration:", mode);
	mode.innerHTML = "<option value='manual'>Manual</option><option value='robotmodel'>Robot Model</option>";
	manual.appendChild(manualContainer);
	addField("Robot Model:", robotModelSelector, robotModel);
	root.appendChild(manual);
	root.appendChild(robotModel);
	root.appendChild(endpointContainer);

	const manualAdapterEditor = createAdapterConfigurationEditor({
		container: manualContainer,
		endpointService,
		configuration: value.manualAdapterConfiguration,
		onChange(adapterConfiguration) {
			const adapterChanged = !value.manualAdapterConfiguration
				|| value.manualAdapterConfiguration.adapterId !== adapterConfiguration.adapterId;
			value = { ...value, manualAdapterConfiguration: adapterConfiguration };
			if (initializingManualAdapter) {
				return;
			}
			if (value.mode === "manual" && adapterChanged) {
				refreshEndpoint();
			}
			emitChange();
		},
	});
	manualAdapterEditor.refresh();
	initializingManualAdapter = false;

	endpointEditor = createEndpointConfigurationEditor({
		container: endpointContainer,
		endpointService,
		guiMessageType,
		endpointType,
		configuration: value.endpointConfiguration,
		fixedAdapterConfiguration: activeAdapterConfiguration() || { adapterId: "", values: {} },
		onChange(endpointConfiguration) {
			value = { ...value, endpointConfiguration: endpointConfigurationOf(endpointConfiguration) };
			emitChange();
		},
	});

	mode.addEventListener("change", async () => {
		value = { ...value, mode: mode.value };
		updateMode();
		await refreshEndpoint();
		emitChange();
	});
	robotModelSelector.addEventListener("change", async () => {
		value = { ...value, robotModelId: robotModelSelector.value };
		await refreshEndpoint();
		emitChange();
	});

	const refreshForRobotModels = async () => {
		renderRobotModels();
		if (value.mode === "robotmodel") {
			await refreshEndpoint();
		}
	};
	if (typeof window !== "undefined") {
		window.addEventListener("vehicle_registry_changed", refreshForRobotModels);
	}

	return Object.freeze({
		async refresh() {
			renderRobotModels();
			updateMode();
			await refreshEndpoint();
		},
		get value() { return value; },
		get activeConfiguration() {
			const adapterConfiguration = activeAdapterConfiguration();
			if (!adapterConfiguration || !adapterConfiguration.adapterId || !value.endpointConfiguration) return null;
			return {
				...value.endpointConfiguration,
				endpointType,
				adapterId: adapterConfiguration.adapterId,
				adapterValues: { ...adapterConfiguration.values },
			};
		},
	});
}
