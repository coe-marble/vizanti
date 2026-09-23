let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let tf = endpointService.getTf();
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.POLYGON;
let endpointConfiguration = null;
let endpointConfigurationEditor;

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

function getStamp(){
	const currentTime = new Date();
	const currentTimeSecs = Math.floor(currentTime.getTime() / 1000);
	const currentTimeNsecs = (currentTime.getTime() % 1000) * 1e6;

	return {
		sec: currentTimeSecs,
		nanosec: currentTimeNsecs
	}
}

function sendMessage(start, end){
	if(!start || !end){
		status.setError("Could not send message, area invalid.");
		return;
	}
	const configuration = getEndpointConfiguration();
	if (!configuration) {
		return;
	}

	let start_pos = view.screenToFixed(start);
	start_pos.z = 0;

	let end_pos = view.screenToFixed(end);
	end_pos.z = 0;

	// Compute the other two points of the square.
	let vector = {
		x: end_pos.x - start_pos.x,
		y: end_pos.y - start_pos.y
	};

	let point2 = {
		x: start_pos.x + vector.x,
		y: start_pos.y,
		z: 0
	};

	let point3 = {
		x: start_pos.x, 
		y: start_pos.y + vector.y,
		z: 0
	};

	endpointService.publish(configuration, guiMessages.createPolygon({
		stamp: getStamp(),
		frameId: tf.fixed_frame,
		points: [start_pos, point2, end_pos, point3],
	}));
	status.setOK();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const view_container = document.getElementById("view_container");

const icon = document.getElementById("{uniqueID}_icon");
const iconImg = icon.getElementsByTagName('img')[0];

let active = false;
let start_point = undefined;
let end_point = undefined;

async function drawBox() {
    const wid = canvas.width;
    const hei = canvas.height;

    ctx.clearRect(0, 0, wid, hei);

	if(end_point !== undefined)
	{
		ctx.fillStyle = "lime";
		ctx.globalAlpha = 0.3;
	
		ctx.fillRect(
			start_point.x, 
			start_point.y, 
			end_point.x - start_point.x, 
			end_point.y - start_point.y
		);
	}
}

function startDrag(event){
	const { clientX, clientY } = event.touches ? event.touches[0] : event;
	start_point = {
		x: clientX,
		y: clientY
	};
}

function drag(event){
	if (start_point === undefined) return;

	const { clientX, clientY } = event.touches ? event.touches[0] : event;
	end_point = {
		x: clientX,
		y: clientY
	};

	drawBox();	
}

function endDrag(event){
	sendMessage(start_point, end_point);

	start_point = undefined;
	end_point = undefined;
	drawBox();
	setActive(false);
}

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
}

window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

view_container.addEventListener("mouseleave", (event) => {
	start_point = undefined;
	end_point = undefined;
	drawBox();
	setActive(false);
});

function addListeners(){
	view_container.addEventListener('mousedown', startDrag);
	view_container.addEventListener('mousemove', drag);
	view_container.addEventListener('mouseup', endDrag);

	view_container.addEventListener('touchstart', startDrag);
	view_container.addEventListener('touchmove', drag);
	view_container.addEventListener('touchend', endDrag);	
}

function removeListeners(){
	view_container.removeEventListener('mousedown', startDrag);
	view_container.removeEventListener('mousemove', drag);
	view_container.removeEventListener('mouseup', endDrag);

	view_container.removeEventListener('touchstart', startDrag);
	view_container.removeEventListener('touchmove', drag);
	view_container.removeEventListener('touchend', endDrag);	
}

function setActive(value){
	active = value;
	view.setInputMovementEnabled(!active);

	if(active){
		addListeners();
		icon.style.backgroundColor = "rgba(255, 255, 255, 1.0)";
		view_container.style.cursor = "pointer";
	}else{
		removeListeners()
		icon.style.backgroundColor = "rgba(124, 124, 124, 0.3)";
		view_container.style.cursor = "";
	}
}

function getEndpointConfiguration() {
	const configuration = endpointConfigurationEditor.activeConfiguration;
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured endpoint.");
		return null;
	}
	return configuration;
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
		saveSettings();
	},
});

// Long press modal open stuff

let longPressTimer;
let isLongPress = false;

icon.addEventListener("click", (event) =>{
	if(!isLongPress)
		setActive(!active);
	else
		isLongPress = false;
});

icon.addEventListener("mousedown", startLongPress);
icon.addEventListener("touchstart", startLongPress);

icon.addEventListener("mouseup", cancelLongPress);
icon.addEventListener("mouseleave", cancelLongPress);
icon.addEventListener("touchend", cancelLongPress);
icon.addEventListener("touchcancel", cancelLongPress);

icon.addEventListener("contextmenu", (event) => {
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

resizeScreen();
endpointConfigurationEditor.refresh();

console.log("Area Widget Loaded {uniqueID}")
