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

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.POSE_WITH_COVARIANCE;
let endpointConfiguration = null;
let endpointConfigurationEditor;

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
	}
	settings.save();
}

function sendMessage(pos, delta){
	if(!pos || !delta){
		status.setError("Could not send message, pose invalid.");
		return;
	}
	const configuration = getEndpointConfiguration();
	if (!configuration) {
		return;
	}

	let yaw = Math.atan2(delta.y, -delta.x);
	let quat = Quaternion.fromEuler(yaw, 0, 0, 'ZXY');

	let map_pos = view.screenToFixed(pos);

	const currentTime = new Date();
	const currentTimeSecs = Math.floor(currentTime.getTime() / 1000);
	const currentTimeNsecs = (currentTime.getTime() % 1000) * 1e6;

	endpointService.publish(configuration, guiMessages.createPoseWithCovariance({
		stamp: { sec: currentTimeSecs, nanosec: currentTimeNsecs },
		frameId: tf.fixed_frame,
		position: { x: map_pos.x, y: map_pos.y, z: 0.0 },
		orientation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
		covariance: [0.25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.06853892326654787],
	}));

	status.setOK();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const view_container = document.getElementById("view_container");
const icon = document.getElementById("{uniqueID}_icon");

let active = false;
let sprite = new Image();
let start_point = undefined;
let delta = undefined;
sprite.src = "assets/initialpose.png";

function drawArrow() {
    const wid = canvas.width;
    const hei = canvas.height;

	ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, wid, hei);

	if(delta){
		let ratio = sprite.naturalHeight/sprite.naturalWidth;
		ctx.setTransform(1,0,0,1,start_point.x, start_point.y); //sx,0,0,sy,px,py
		ctx.rotate(Math.atan2(-delta.y, -delta.x));
		ctx.drawImage(sprite, -80, -80*ratio, 160, 160*ratio);
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
	delta = {
		x: start_point.x - clientX,
		y: start_point.y - clientY,
	};

	drawArrow();	
}

function endDrag(event){
	if (start_point === undefined) {
		return;
	}

	// A placement click has no movement event. Use a forward heading so it
	// still produces a valid initial pose; dragging continues to set heading.
	sendMessage(start_point, delta || { x: -1, y: 0 });

	start_point = undefined;
	delta = undefined;
	drawArrow();
	setActive(false);
}

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
}

window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

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

console.log("Initialpose Widget Loaded {uniqueID}")
