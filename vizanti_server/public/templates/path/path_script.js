let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let tf = endpointService.getTf();
let settings = persistentModule.settings;
let Status = StatusModule.Status;

let endpointConfiguration = null;
let endpointConfigurationEditor;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.PATH;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;

let pose_array = undefined;

const text_frameid = document.getElementById("{uniqueID}_frame_text");
const text_point_count = document.getElementById("{uniqueID}_points_text");
const text_total_dist = document.getElementById("{uniqueID}_distance_text");

const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawPath();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');

function setOpacityText(val){
	if(val == 0.0)
		opacityValue.textContent = "0.0 (Path rendering disabled)";
	else
		opacityValue.textContent = val;
}

opacitySlider.addEventListener('input', () =>  {
	setOpacityText(opacitySlider.value);
	saveSettings();
	drawPath();
});


//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	opacitySlider.value = loaded_data.opacity ?? 1.0;
	setOpacityText(loaded_data.opacity);

	colourpicker.value = loaded_data.color ?? "#54db67";
	throttle.value = loaded_data.throttle ?? 100;
}else{
	saveSettings();
}

//update the icon colour when it's loaded or when the image source changes
icon.onload = () => {
	utilModule.setIconColor(icon, colourpicker.value);
};
if (icon.contentDocument) {
	utilModule.setIconColor(icon, colourpicker.value);
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		color: colourpicker.value,
		throttle: throttle.value,
		opacity: opacitySlider.value
	}
	settings.save();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function getDistance(poses) {
	if (!Array.isArray(poses) || poses.length < 2) return 0;
	return poses.slice(1).reduce((distance, pose, index) => {
		const previous = poses[index];
		const dx = pose.position.x - previous.position.x;
		const dy = pose.position.y - previous.position.y;
		const dz = pose.position.z - previous.position.z;
		return distance + Math.sqrt(dx * dx + dy * dy + dz * dz);
	}, 0);
}

//Rendering
async function drawPath(){

	const wid = canvas.width;
    const hei = canvas.height;
	ctx.clearRect(0, 0, wid, hei);

	ctx.globalAlpha = opacitySlider.value;

	if(pose_array === undefined || pose_array.length < 2 || opacitySlider.value == 0.0){
		return false;
	}

	ctx.lineWidth = 2;
	ctx.strokeStyle = colourpicker.value;
	ctx.beginPath();

	const firstPos = view.fixedToScreen({
		x: pose_array[0].translation.x,
		y: pose_array[0].translation.y
	});
	ctx.moveTo(firstPos.x, firstPos.y);

	for (let i = 1; i < pose_array.length; i++) {
		const point = pose_array[i];
		const pos = view.fixedToScreen({
			x: point.translation.x,
			y: point.translation.y
		});
		ctx.lineTo(pos.x, pos.y);
	}

	ctx.stroke();
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		status.setError("No path endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		let hasWarning = false;
		const transformed = [];
		for (const pose of message.poses) {
			const frameId = pose.frameId || tf.fixed_frame;
			if (pose.frameId === "") hasWarning = true;
			if (!tf.absoluteTransforms[frameId]) {
				status.setError(`Required transform frame "${frameId}" not found.`);
				return;
			}
			transformed.push(tf.transformPoseStamped(
				{ frameId, stamp: pose.stamp }, pose.position, pose.orientation
			));
		}

		text_frameid.innerText = `Frame: ${message.frameId}`;
		text_point_count.innerText = `Points: ${message.poses.length}`;
		let dist = getDistance(message.poses);

		if(dist > 1000.0){
			text_total_dist.innerText = `Distance: ${(dist / 1000.0).toFixed(3)} km`;
		}else if(dist < 1.0){
			text_total_dist.innerText = `Distance: ${(dist * 100.0).toFixed(1)} cm`;
		}else{
			text_total_dist.innerText = `Distance: ${dist.toFixed(2)} m`;
		}

		pose_array = transformed;
		drawPath();
		if (hasWarning) status.setWarn("An empty transform frame was treated as the fixed frame.");
		else status.setOK();
	}, { throttleRate: parseInt(throttle.value), queueLength: 1 });

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
		pose_array = undefined;
		connect();
	},
});
endpointConfigurationEditor.refresh();

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawPath();
}

window.addEventListener("tf_fixed_frame_changed", connect);
window.addEventListener("view_changed", drawPath);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("Path Widget Loaded {uniqueID}")
