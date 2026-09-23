let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);

let settings = persistentModule.settings;
let imageToDataURL = utilModule.imageToDataURL;
let Status = StatusModule.Status;
let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.BATTERY_STATE;
let endpointConfiguration = null;
let endpointConfigurationEditor;
let subscription = undefined;

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration
		?? legacyEndpointConfiguration(loaded_data.topic);
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
	}
	settings.save();
}

function legacyEndpointConfiguration(topic) {
	const endpointId = typeof topic === "string" ? topic.trim() : "";
	return {
		mode: "manual",
		robotModelId: "",
		manualAdapterConfiguration: {
			adapterId: "ros2",
			values: { namespace: "", tfFrame: "base_link" },
		},
		endpointConfiguration: {
			endpointValues: {},
			outputMessageId: "",
			endpointId,
			manualEndpointId: endpointId,
			endpoint: null,
			endpointMode: "manual",
		},
	};
}

let icons = {};
icons["20%"] = await imageToDataURL("assets/battery_20.svg");
icons["40%"] = await imageToDataURL("assets/battery_40.svg");
icons["60%"] = await imageToDataURL("assets/battery_60.svg");
icons["80%"] = await imageToDataURL("assets/battery_80.svg");
icons["100%"] = await imageToDataURL("assets/battery_100.svg");
icons["charging_20%"] = await imageToDataURL("assets/battery_20_charging.svg");
icons["charging_40%"] = await imageToDataURL("assets/battery_40_charging.svg");
icons["charging_60%"] = await imageToDataURL("assets/battery_60_charging.svg");
icons["charging_80%"] = await imageToDataURL("assets/battery_80_charging.svg");
icons["charging_100%"] = await imageToDataURL("assets/battery_100_charging.svg");
icons["unknown"] = await imageToDataURL("assets/battery_unknown.svg");

const STATUS = [
	"UNKNOWN",
	"CHARGING",
	"DISCHARGING",
	"NOT CHARGING",
	"FULL",
]

const HEALTH = [
	"UNKNOWN",
	"GOOD",
	"OVERHEAT",
	"DEAD",
	"OVERVOLTAGE",
	"UNSPEC FAILURE",
	"COLD",
	"WATCHDOG TIMER EXPIRED",
	"SAFETY TIMER EXPIRED"
]

const CHEMISTRY = [
	"UNKNOWN",
	"NIMH",
	"LION",
	"LIPO",
	"LIFE",
	"NICD",
	"LIMN"
]

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const text_percent = document.getElementById("{uniqueID}_percentage");
const text_voltage = document.getElementById("{uniqueID}_voltage");
const text_cell_voltage = document.getElementById("{uniqueID}_cell_voltage");
const text_current = document.getElementById("{uniqueID}_current");
const text_charge = document.getElementById("{uniqueID}_charge");

const text_status = document.getElementById("{uniqueID}_charging_status");
const text_health = document.getElementById("{uniqueID}_health");
const text_chemistry = document.getElementById("{uniqueID}_chemistry");

function connect(){
	if(subscription !== undefined){
		subscription.unsubscribe();
		subscription = undefined;
	}

	const activeConfiguration = activeEndpointConfiguration();
	if(!activeConfiguration || !activeConfiguration.endpoint){
		status.setError("Select a battery endpoint.");
		return;
	}

	status.setWarn("No data received.");
	
	subscription = endpointService.subscribe(activeConfiguration, endpointMessageType, (message) => {

		let chg_prefix = message.powerSupplyStatus == 1 ? "charging_": "";

		if(message.percentage <= 0.2){
			icon.src = icons[chg_prefix+"20%"];
		}
		else if(message.percentage <= 0.4){
			icon.src = icons[chg_prefix+"40%"];
		}
		else if(message.percentage <= 0.6){
			icon.src = icons[chg_prefix+"60%"];
		}
		else if(message.percentage <= 0.8){
			icon.src = icons[chg_prefix+"80%"];
		}
		else{
			icon.src = icons[chg_prefix+"100%"];
		}

		text_percent.innerText = "Percentage: "+parseInt(message.percentage*100)+" %";

		if(message.voltage)
			text_voltage.innerText = "Voltage: "+message.voltage.toFixed(2)+" V";

		if(message.current)
			text_current.innerText = "Current draw: "+message.current.toFixed(2)+" A";

		if(message.charge)
			text_charge.innerText = "Charge: "+message.charge.toFixed(2)+"/"+message.capacity.toFixed(2)+" Ah";

		if(message.cellVoltage.length > 0){
			let cellstr = "Cell Voltages: ";

			for(let i = 0; i < message.cellVoltage.length; i++){
				cellstr += message.cellVoltage[i].toFixed(2)+" V, ";
			}

			text_cell_voltage.innerText = cellstr.substring(0, cellstr.length - 2);
		}

		text_status.innerText = "Status: "+STATUS[message.powerSupplyStatus];
		text_health.innerText = "Health: "+HEALTH[message.powerSupplyHealth];
		text_chemistry.innerText = "Type: "+CHEMISTRY[message.powerSupplyTechnology];

		status.setOK();
	});

	saveSettings();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
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
		icon.src = icons["unknown"];
		saveSettings();
		connect();
	},
});

icon.addEventListener("click", ()=>{
	endpointConfigurationEditor.refresh();
});

endpointConfigurationEditor.refresh();

console.log("Battery Widget Loaded {uniqueID}")
