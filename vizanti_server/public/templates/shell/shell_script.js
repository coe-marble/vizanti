let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let adapterConfigurationEditorModule = await import(`${base_url}/js/modules/adapter_configuration_editor.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let serverApiModule = await import(`${base_url}/js/modules/server_api.js`);

let endpointService = endpointServiceModule.endpointService;
let createAdapterConfigurationEditor = adapterConfigurationEditorModule.createAdapterConfigurationEditor;
let settings = persistentModule.settings;
let serverApi = serverApiModule.serverApi;

const adapterConfigurationContainer = document.getElementById("{uniqueID}_adapter_configuration");
const shortcutSection = document.getElementById("{uniqueID}_shortcuts_section");
const shortcutSelector = document.getElementById("{uniqueID}_shortcuts");
const applyShortcutButton = document.getElementById("{uniqueID}_apply_shortcut");
const commandInput = document.getElementById("{uniqueID}_command");
const timeoutInput = document.getElementById("{uniqueID}_timeout");
const backgroundInput = document.getElementById("{uniqueID}_background");
const runButton = document.getElementById("{uniqueID}_run");
const statusText = document.getElementById("{uniqueID}_status");
const output = document.getElementById("{uniqueID}_output");

let adapterConfiguration = null;
let shortcuts = [];

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	adapterConfiguration = loadedData.adapter_configuration || null;
	commandInput.value = typeof loadedData.command === "string" ? loadedData.command : "";
	timeoutInput.value = Number.isInteger(loadedData.timeout_seconds) ? loadedData.timeout_seconds : 10;
	backgroundInput.checked = loadedData.background === true;
}

function saveSettings() {
	settings["{uniqueID}"] = {
		adapter_configuration: adapterConfiguration,
		command: commandInput.value,
		timeout_seconds: Number(timeoutInput.value),
		background: backgroundInput.checked,
	};
	settings.save();
}

async function refreshShortcuts() {
	shortcuts = await endpointService.commandShortcuts(adapterConfiguration);
	shortcutSection.hidden = shortcuts.length === 0;
	shortcutSelector.innerHTML = shortcuts.map((shortcut) =>
		`<option value="${shortcut.id}">${shortcut.label}</option>`).join("");
}

function applyShortcut() {
	const shortcut = shortcuts.find((item) => item.id === shortcutSelector.value);
	if (shortcut) {
		commandInput.value = shortcut.command;
		backgroundInput.checked = shortcut.background === true;
		commandInput.focus();
		saveSettings();
	}
}

async function runCommand() {
	const command = commandInput.value.trim();
	const timeoutSeconds = Number(timeoutInput.value);
	if (command === "") {
		statusText.textContent = "Enter a command.";
		return;
	}
	if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 30) {
		statusText.textContent = "Timeout must be an integer from 1 to 30 seconds.";
		return;
	}

	runButton.disabled = true;
	statusText.textContent = "Running...";
	output.textContent = "";
	saveSettings();
	try {
		const result = await serverApi.executeCommand({
			command, timeoutSeconds, background: backgroundInput.checked,
		});
		statusText.textContent = result.success
			? (backgroundInput.checked ? `Started process ${result.processId}.` : `Completed with exit code ${result.exitCode}.`)
			: `Failed with exit code ${result.exitCode}.`;
		output.textContent = [result.stdout, result.stderr].filter((text) => text !== "").join("\n");
	} catch (error) {
		statusText.textContent = "Command failed.";
		output.textContent = String(error);
	} finally {
		runButton.disabled = false;
	}
}

applyShortcutButton.addEventListener("click", applyShortcut);
runButton.addEventListener("click", runCommand);
commandInput.addEventListener("input", saveSettings);
timeoutInput.addEventListener("input", saveSettings);
backgroundInput.addEventListener("change", saveSettings);

const adapterConfigurationEditor = createAdapterConfigurationEditor({
	container: adapterConfigurationContainer,
	endpointService,
	configuration: adapterConfiguration,
	onChange(configuration) {
		adapterConfiguration = configuration;
		saveSettings();
		refreshShortcuts();
	},
});
adapterConfigurationEditor.refresh();

console.log("Shell Widget Loaded {uniqueID}");
