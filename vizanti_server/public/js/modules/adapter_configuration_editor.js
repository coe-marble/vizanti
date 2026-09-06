// Renders the adapter choice and only the fields declared by that adapter.
// It deliberately has no knowledge of GUI messages or endpoints.
export function createAdapterConfigurationEditor({
	container,
	endpointService,
	configuration = null,
	onChange = () => {},
}) {
	let value = configuration;
	const form = document.createElement("div");
	form.className = "adapter-configuration";
	container.appendChild(form);
	const adapterSelector = document.createElement("select");
	const fieldsContainer = document.createElement("div");

	function addField(label, control, parent = form) {
		const row = document.createElement("div");
		row.className = "configuration-field";
		const labelElement = document.createElement("label");
		labelElement.textContent = label;
		row.appendChild(labelElement);
		row.appendChild(control);
		parent.appendChild(row);
	}

	addField("Adapter:", adapterSelector);
	form.appendChild(fieldsContainer);

	function adapterOptions() {
		return endpointService.listAdapters().map((adapter) => ({ ...adapter }));
	}

	function defaults(adapterId) {
		return endpointService.configurationFields(adapterId).reduce((values, field) => {
			values[field.id] = field.defaultValue || "";
			return values;
		}, {});
	}

	function renderFields() {
		fieldsContainer.innerHTML = "";
		for (const field of endpointService.configurationFields(value.adapterId)) {
			const input = document.createElement("input");
			input.type = field.type || "text";
			input.placeholder = field.placeholder || "";
			input.value = value.values[field.id] || field.defaultValue || "";
			input.addEventListener("input", () => {
				value = {
					...value,
					values: { ...value.values, [field.id]: input.value },
				};
				onChange(value);
			});
			addField(`${field.label}:`, input, fieldsContainer);
		}
	}

	function refresh() {
		const adapters = adapterOptions();
		if (!value || !adapters.some((adapter) => adapter.id === value.adapterId)) {
			const adapterId = adapters[0] ? adapters[0].id : "";
			value = { adapterId, values: defaults(adapterId) };
		}
		adapterSelector.innerHTML = adapters.map((adapter) =>
			`<option value="${adapter.id}">${adapter.label}</option>`).join("");
		adapterSelector.value = value.adapterId;
		renderFields();
		onChange(value);
	}

	adapterSelector.addEventListener("change", () => {
		value = { adapterId: adapterSelector.value, values: defaults(adapterSelector.value) };
		renderFields();
		onChange(value);
	});

	return Object.freeze({
		refresh,
		get value() { return value; },
	});
}
