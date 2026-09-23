let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let rawTopicEditorModule = await import(`${base_url}/js/modules/raw_topic_configuration_editor.js`);

let endpointService = endpointServiceModule.endpointService;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let createRawTopicConfiguration = rawTopicEditorModule.createRawTopicConfiguration;

let endpointConfiguration = null;
let endpointConfigurationEditor;
let subscription = undefined;
let previousTopic = "";

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const throttle = document.getElementById("{uniqueID}_throttle");
const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName("img")[0];
const infoDiv = document.getElementById("{uniqueID}_info_display");
const liveDataDiv = document.getElementById("{uniqueID}_live_data_display");

throttle.addEventListener("input", () => {
	saveSettings();
	connect();
});

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	endpointConfiguration = loadedData.endpoint_configuration || null;
	throttle.value = loadedData.throttle ?? 500;
} else {
	saveSettings();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		throttle: throttle.value,
	};
	settings.save();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function deliveryOptions() {
	const throttleRate = Number.parseInt(throttle.value, 10);
	return {
		throttleRate: Number.isFinite(throttleRate) && throttleRate >= 0 ? throttleRate : 0,
		queueLength: 1,
	};
}

function disconnect() {
	if (subscription !== undefined) {
		subscription.unsubscribe();
		subscription = undefined;
	}
}

function createNestedDisplay(value, indent = 0) {
	const container = document.createElement("div");
	const indentSize = 20;
	const maxStringLength = 200;
	const maxArrayLength = 50;
	const truncateString = (text) => typeof text === "string" && text.length > maxStringLength
		? `${text.substring(0, maxStringLength)}... [truncated]` : text;

	function appendText(text, level) {
		const row = document.createElement("p");
		row.style.marginLeft = `${level * indentSize}px`;
		row.style.marginTop = "2px";
		row.style.marginBottom = "2px";
		row.textContent = text;
		container.appendChild(row);
	}

	function appendValue(key, item, level) {
		if (Array.isArray(item)) {
			appendText(`${key}: Array(${item.length})`, level);
			item.slice(0, maxArrayLength).forEach((arrayItem, index) => {
				if (typeof arrayItem === "object" && arrayItem !== null) {
					appendText(`[${index}]:`, level + 1);
					container.appendChild(createNestedDisplay(arrayItem, level + 2));
				} else {
					appendText(`[${index}]: ${truncateString(arrayItem)}`, level + 1);
				}
			});
			if (item.length > maxArrayLength) {
				appendText(`... ${item.length - maxArrayLength} more items`, level + 1);
			}
			return;
		}
		if (typeof item === "object" && item !== null) {
			appendText(`${key}:`, level);
			container.appendChild(createNestedDisplay(item, level + 1));
			return;
		}
		appendText(`${key}: ${truncateString(item)}`, level);
	}

	if (typeof value !== "object" || value === null) {
		appendText(String(truncateString(value)), indent);
		return container;
	}
	for (const [key, item] of Object.entries(value)) {
		appendValue(key, item, indent);
	}
	return container;
}

function connect() {
	disconnect();

	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured topic.");
		return;
	}

	const topic = configuration.endpoint.topic;
	status.setWarn("No data received.");
	if (previousTopic !== topic) {
		liveDataDiv.innerHTML = "<p>Waiting for data...</p>";
		infoDiv.innerHTML = "<p>Waiting for data...</p>";
		previousTopic = topic;
	}

	subscription = endpointService.subscribeRaw(configuration, async (message) => {
		liveDataDiv.innerHTML = "";
		liveDataDiv.appendChild(createNestedDisplay(message));
		try {
			const topicInfo = await endpointService.getTopicInfo(configuration);
			infoDiv.innerHTML = "";
			infoDiv.appendChild(createNestedDisplay(topicInfo));
			status.setOK();
		} catch (error) {
			status.setError(error.message);
		}
	}, deliveryOptions());

	saveSettings();
}

endpointConfigurationEditor = createRawTopicConfiguration({
	container: document.getElementById("{uniqueID}_endpoint_configuration"),
	endpointService,
	configuration: endpointConfiguration,
	onChange(configuration) {
		endpointConfiguration = configuration;
		saveSettings();
		connect();
	},
});

icon.addEventListener("click", () => {
	endpointConfigurationEditor.refresh();
});

endpointConfigurationEditor.refresh();

console.log("Inspector Widget Loaded {uniqueID}");
