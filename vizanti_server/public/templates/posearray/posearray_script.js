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
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.POSE_ARRAY;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;
let poses = [];
let frame = "";

const scaleSlider = document.getElementById('{uniqueID}_scale');
const scaleSliderValue = document.getElementById('{uniqueID}_scale_value');

scaleSlider.addEventListener('input', function () {
	scaleSliderValue.textContent = this.value;
	drawArrows();
});

scaleSlider.addEventListener('change', saveSettings);

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawArrows();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	colourpicker.value = loaded_data.color ?? "#f74127";

	scaleSlider.value = loaded_data.scale;
	scaleSliderValue.textContent = scaleSlider.value;
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
		scale: parseFloat(scaleSlider.value),
		color: colourpicker.value,
		throttle: throttle.value
	}
	settings.save();
}

//Rendering

async function drawArrows(){

	function drawTriangle(height, width){
		ctx.moveTo(0, -width);
		ctx.lineTo(height, 0);
		ctx.lineTo(0, width);
		ctx.lineTo(0, -width);
	}

	function drawArrow(height, width, height_to_tip, tipwidth){
		ctx.moveTo(0, -width);
		ctx.lineTo(height_to_tip, -width);
		ctx.lineTo(height_to_tip, -tipwidth);
		ctx.lineTo(height, 0);
		ctx.lineTo(height_to_tip, tipwidth);
		ctx.lineTo(height_to_tip, width);
		ctx.lineTo(0, width);
		ctx.lineTo(0, -width);
	}

	const unit = view.getMapUnitsInPixels(1.0);

	const wid = canvas.width;
    const hei = canvas.height;

	const scale = unit * parseFloat(scaleSlider.value);
	const arrow_height = parseInt(scale*0.5);
	const arrow_width = parseInt(scale*0.01)+1;
	const arrow_tip = parseInt(scale*0.07)+1;
	const arrow_tipwidth = parseInt(scale*0.07)+1;
	const arrow_height_to_tip = arrow_height - arrow_tip;

	const triangle_width = parseInt(scale*0.06)+1;
	const triangle_height = parseInt(scale*0.3)+1;

	ctx.setTransform(1,0,0,1,0,0);
	ctx.clearRect(0, 0, wid, hei);
	ctx.fillStyle = colourpicker.value;

	if(frame === tf.fixed_frame && poses.length > 0){
		ctx.beginPath();

		if(poses.length < 100){
			for (let i = 0; i < poses.length; i++) {
				const p = poses[i];
				const screenpos = view.fixedToScreen(p);
	
				ctx.setTransform(1,0,0,-1,screenpos.x, screenpos.y); //sx,0,0,sy,px,py
				ctx.rotate(p.yaw);
	
				drawArrow(arrow_height, arrow_width, arrow_height_to_tip, arrow_tipwidth);
			}
		}else{
			for (let i = 0; i < poses.length; i++) {
				const p = poses[i];
				const screenpos = view.fixedToScreen(p);
	
				ctx.setTransform(1,0,0,-1,screenpos.x, screenpos.y); //sx,0,0,sy,px,py
				ctx.rotate(p.yaw);
	
				drawTriangle(triangle_height, triangle_width);
			}
		}

		ctx.fill();
	}
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No pose array endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const frameId = message.frameId || tf.fixed_frame;
		const hasWarning = message.frameId === "";

		if(!tf.absoluteTransforms[frameId]){
			status.setError(`Required transform frame "${frameId}" not found.`);
			return;
		}

		poses = [];
		frame = tf.fixed_frame;

		message.poses.forEach((pose) => {
			const transformed = tf.transformPoseStamped(
				{ frameId, stamp: message.stamp }, pose.position, pose.orientation
			);
			poses.push({
				x: transformed.translation.x,
				y: transformed.translation.y,
				yaw: transformed.rotation.toEuler().h,
			});
		});

		drawArrows();
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
		poses = [];
		connect();
	},
});
endpointConfigurationEditor.refresh();

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawArrows();
}

window.addEventListener("tf_fixed_frame_changed", drawArrows);
window.addEventListener("view_changed", drawArrows);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("PoseArray Widget Loaded {uniqueID}")
