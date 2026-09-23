let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let settings = persistentModule.settings;
let imageToDataURL = utilModule.imageToDataURL;
let Status = StatusModule.Status;

let endpointConfiguration = null;
let endpointConfigurationEditor;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.TEMPERATURE;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;

//persistent loading, so we don't re-fetch on every update
let icons = {};
icons["hot"] = await imageToDataURL("assets/temp_hot.svg");
icons["cold"] = await imageToDataURL("assets/temp_cold.svg");
icons["warm"] = await imageToDataURL("assets/temp_warm.svg");
icons["unknown"] = await imageToDataURL("assets/temp_warm.svg");

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const highBox = document.getElementById('{uniqueID}_hightemp');
const lowBox = document.getElementById('{uniqueID}_lowtemp');

const text_temperature = document.getElementById("{uniqueID}_temperature");
const text_variance = document.getElementById("{uniqueID}_variance");
const text_link = document.getElementById("{uniqueID}_tflink");

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
	highBox.value = loaded_data.high;
	lowBox.value = loaded_data.low;
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		low: lowBox.value,
		high: highBox.value
	}
	settings.save();
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No temperature endpoint configured.");
		return;
	}

	status.setWarn("No data received.");
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {

		if(message.temperature > highBox.value){
			icon.src = icons["hot"];
		}
		else if(message.temperature < lowBox.value){
			icon.src = icons["cold"];
		}
		else{
			icon.src = icons["warm"];
		}

		text_temperature.innerText = "Temperature (°C): "+(Math.round(message.temperature * 100) / 100).toFixed(2);
		text_variance.innerText = "Variance: "+(Math.round(message.variance * 100) / 100).toFixed(2);
		text_link.innerText = "TF Frame: "+message.frameId;

		status.setOK();
	}, { throttleRate: 500, queueLength: 1 });

	saveSettings();
}

endpointConfigurationEditor = createEndpointConfiguration({
	container: document.getElementById("{uniqueID}_endpoint_configuration"),
	endpointService,
	guiMessageType: endpointMessageType,
	endpointType: "topic",
	configuration: endpointConfiguration,
	getRobotModels: vehicleSelectionModule.getRegisteredVehicles,
	onChange(configuration) {
		endpointConfiguration = configuration;
		icon.src = icons.unknown;
		connect();
	},
});
endpointConfigurationEditor.refresh();

console.log("Temperature Widget Loaded {uniqueID}")
