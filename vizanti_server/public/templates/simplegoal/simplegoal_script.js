let viewModule = await import(`${base_url}/js/modules/view.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);

let view = viewModule.view;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let endpointService = endpointServiceModule.endpointService;
let tf = endpointService.getTf();
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

let endpointConfiguration = null;
let endpointConfigurationEditor;
const discoveryStatus = document.getElementById("{uniqueID}_discovery_status");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration !== undefined
		? loaded_data.endpoint_configuration : {
		mode: loaded_data.configuration_mode || "manual",
		robotModelId: loaded_data.selected_vehicle_id || "",
		manual: loaded_data.manual_endpoint_configuration || null,
		robotModel: loaded_data.robot_endpoint_configuration || null,
	};
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
	}
	settings.save();
}

function getEndpointConfiguration() {
	const configuration = endpointConfigurationEditor.activeConfiguration;
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured endpoint.");
		return null;
	}
	return configuration;
}

function sendMessage(pos, delta){
	if(!pos){
		status.setError("Could not send message, pose invalid.");
		return;
	}

	const configuration = getEndpointConfiguration();
	if (!configuration) {
		return;
	}

	let yaw = delta ? Math.atan2(delta.y, -delta.x) : 0;
	let quat = Quaternion.fromEuler(yaw, 0, 0, 'ZXY');

	let map_pos = view.screenToFixed(pos);

	const currentTime = new Date();
	const currentTimeSecs = Math.floor(currentTime.getTime() / 1000);
	const currentTimeNsecs = (currentTime.getTime() % 1000) * 1e6;

	endpointService.publish(configuration, guiMessages.createPose({
		stamp: { sec: currentTimeSecs, nanosec: currentTimeNsecs }, frameId: tf.fixed_frame,
		position: {
				x: map_pos.x,
				y: map_pos.y,
				z: 0.0
			},
		orientation: {
				x: quat.x,
				y: quat.y,
				z: quat.z,
				w: quat.w
			}
		}
	));
	status.setOK();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const view_container = document.getElementById("view_container");

const icon = document.getElementById("{uniqueID}_icon");
const iconImg = icon.getElementsByTagName('img')[0];

let goalActive = false;
let sprite = new Image();
let start_point = undefined;
let delta = undefined;
sprite.src = "assets/simplegoal.png";

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
	sendMessage(start_point, delta);

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
	goalActive = value;
	view.setInputMovementEnabled(!goalActive);

	if(goalActive){
		addListeners();
		icon.style.backgroundColor = "rgba(255, 255, 255, 1.0)";
		view_container.style.cursor = "pointer";
	}else{
		removeListeners()
		icon.style.backgroundColor = "rgba(124, 124, 124, 0.3)";
		view_container.style.cursor = "";
	}
}

endpointConfigurationEditor = createEndpointConfiguration({
	container: document.getElementById("{uniqueID}_endpoint_configuration"),
	endpointService,
	guiMessageType: guiMessages.GUI_MESSAGE_TYPE.POSE,
	endpointType: "topic",
	configuration: endpointConfiguration,
	getRobotModels: vehicleSelectionModule.getRegisteredVehicles,
	onChange(configuration) { endpointConfiguration = configuration; saveSettings(); },
});

async function discoverTopics() {
	discoveryStatus.textContent = "Topics: fetching...";
	try {
		await endpointConfigurationEditor.refresh();
		discoveryStatus.textContent = "Topics: fetched.";
	} catch (error) {
		discoveryStatus.textContent = "Topics: failed to fetch.";
	}
}

// Long press modal open stuff

let longPressTimer;
let isLongPress = false;

icon.addEventListener("click", (event) =>{
	if(!isLongPress) {
		discoverTopics();
		setActive(!goalActive);
	} else {
		isLongPress = false;
	}
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
		openModal("{uniqueID}_modal");
		discoverTopics();
	}, 500);
}

function cancelLongPress(event) {
	clearTimeout(longPressTimer);
}

resizeScreen();

console.log("Simple Goal Widget Loaded {uniqueID}")
