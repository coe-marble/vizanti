let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);

let endpointService = endpointServiceModule.endpointService;
let settings = persistentModule.settings;
let imageToDataURL = utilModule.imageToDataURL;
let Status = StatusModule.Status;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

let endpointConfiguration = null;
let endpointConfigurationEditor;
let subscription = undefined;
let actionMode = "bool_topic";
let value = false;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

// Persistent loading avoids re-fetching on every update.
let icons = {};
icons["true"] = await imageToDataURL("assets/button_true.svg");
icons["false"] = await imageToDataURL("assets/button_false.svg");
icons["default"] = await imageToDataURL("assets/button.svg");

const icondiv = document.getElementById("{uniqueID}_icon");
const icon = icondiv.getElementsByTagName('img')[0];
const icontext = icondiv.getElementsByTagName('p')[0];
const namebox = document.getElementById("{uniqueID}_name");
const actionSelector = document.getElementById("{uniqueID}_action");
const endpointContainer = document.getElementById("{uniqueID}_endpoint_configuration");

const ACTIONS = Object.freeze({
	bool_topic: Object.freeze({ endpointType: "topic", guiMessageType: guiMessages.GUI_MESSAGE_TYPE.BOOL, tracksValue: true }),
	empty_topic: Object.freeze({ endpointType: "topic", guiMessageType: guiMessages.GUI_MESSAGE_TYPE.EMPTY, tracksValue: false }),
	empty_service: Object.freeze({ endpointType: "service", guiMessageType: guiMessages.GUI_MESSAGE_TYPE.EMPTY, tracksValue: false }),
	trigger_service: Object.freeze({ endpointType: "service", guiMessageType: guiMessages.GUI_MESSAGE_TYPE.TRIGGER, tracksValue: false }),
	setbool_service: Object.freeze({ endpointType: "service", guiMessageType: guiMessages.GUI_MESSAGE_TYPE.BOOL, tracksValue: true }),
});

function action() {
	return ACTIONS[actionMode] || ACTIONS.bool_topic;
}

// Dataset text is used for in-folder labels.
function setLabel(string){
	icontext.textContent = string;
	icon.alt = string;
	icon.dataset.text = string;
}

namebox.addEventListener('input', function() {
	setLabel(namebox.value);
	saveSettings();
});

actionSelector.addEventListener('change', () => {
	actionMode = actionSelector.value;
	endpointConfiguration = null;
	value = false;
	disconnect();
	updateIcon();
	saveSettings();
	renderEndpointConfiguration();
});

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
	actionMode = ACTIONS[loaded_data.action_mode] ? loaded_data.action_mode : "bool_topic";

	namebox.value = loaded_data.text ?? "Text";
	setLabel(namebox.value);
}else{
	saveSettings();
}
actionSelector.value = actionMode;

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		action_mode: actionMode,
		text: namebox.value,
	}
	settings.save();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function disconnect() {
	if (subscription !== undefined) {
		subscription.unsubscribe();
		subscription = undefined;
	}
}

function updateIcon() {
	icon.src = action().tracksValue ? icons[value] : icons["default"];
}

function connect(){
	disconnect();

	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		updateIcon();
		status.setError("Select a configured endpoint.");
		return;
	}

	if (actionMode === "bool_topic") {
		status.setWarn("No data received.");
		subscription = endpointService.subscribe(configuration, action().guiMessageType, (message) => {
			value = message.value;
			updateIcon();
			status.setOK();
		});
	}
	else if (actionMode === "setbool_service") {
		value = false;
		updateIcon();
	}
	else {
		updateIcon();
	}

	saveSettings();
}

async function sendMessage(){
	icondiv.classList.add("button-press-effect");
	setTimeout(() => {
		icondiv.classList.remove("button-press-effect");
	}, 200);

	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured endpoint.");
		return;
	}

	try {
		if (actionMode === "bool_topic") {
			endpointService.publish(configuration, guiMessages.createBool(!value));
			return;
		}
		if (actionMode === "empty_topic") {
			endpointService.publish(configuration, guiMessages.createEmpty());
			return;
		}
		if (actionMode === "empty_service") {
			await endpointService.call(configuration, guiMessages.createEmpty());
			status.setOK();
			return;
		}
		if (actionMode === "trigger_service") {
			const result = await endpointService.call(configuration, guiMessages.createTrigger());
			if (result.success) {
				status.setOK(result.message);
			} else {
				status.setError(result.message);
			}
			icon.src = icons[result.success];
			setTimeout(() => { updateIcon(); }, 500);
			return;
		}
		if (actionMode === "setbool_service") {
			const result = await endpointService.call(configuration, guiMessages.createBool(!value));
			if (result.success) {
				value = !value;
				updateIcon();
				status.setOK(result.message);
			} else {
				status.setError(result.message);
			}
		}
	} catch (error) {
		status.setError(error.message);
	}
}

function renderEndpointConfiguration() {
	endpointContainer.innerHTML = "";
	const configurationAction = action();
	endpointConfigurationEditor = createEndpointConfiguration({
		container: endpointContainer,
		endpointService,
		guiMessageType: configurationAction.guiMessageType,
		endpointType: configurationAction.endpointType,
		configuration: endpointConfiguration,
		getRobotModels: vehicleSelectionModule.getRegisteredVehicles,
		onChange(configuration) {
			endpointConfiguration = configuration;
			saveSettings();
			connect();
		},
	});
	endpointConfigurationEditor.refresh();
}

renderEndpointConfiguration();
updateIcon();

// Long press modal open handling.
let longPressTimer;
let isLongPress = false;

icondiv.addEventListener("click", (event) =>{
	if(!isLongPress){
		sendMessage();
	}else{
		isLongPress = false;
	}
});

icondiv.addEventListener("mousedown", startLongPress);
icondiv.addEventListener("touchstart", startLongPress);

icondiv.addEventListener("mouseup", cancelLongPress);
icondiv.addEventListener("mouseleave", cancelLongPress);
icondiv.addEventListener("touchend", cancelLongPress);
icondiv.addEventListener("touchcancel", cancelLongPress);

icondiv.addEventListener("contextmenu", (event) => {
	event.preventDefault();
});

function startLongPress(event) {
	isLongPress = false;
	longPressTimer = setTimeout(() => {
		isLongPress = true;
		endpointConfigurationEditor.refresh();
		openModal("{uniqueID}_modal");
	}, 500);
}

function cancelLongPress(event) {
	clearTimeout(longPressTimer);
}

console.log("Button Widget Loaded {uniqueID}")
