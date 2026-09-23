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
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.LASER_SCAN;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;

let data = undefined;

const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const text_angle = document.getElementById("{uniqueID}_angle_text");
const text_frame = document.getElementById("{uniqueID}_frame_text");
const text_angleinc = document.getElementById("{uniqueID}_angleinc_text");
const text_pointscount = document.getElementById("{uniqueID}_points_text");
const text_scantime = document.getElementById("{uniqueID}_scan_time_text");
const text_min = document.getElementById("{uniqueID}_rangemin_text");
const text_max = document.getElementById("{uniqueID}_rangemax_text");

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');

function setOpacityText(val){
	if(val == 0.0)
		opacityValue.textContent = "0.0 (Scan rendering disabled)";
	else
		opacityValue.textContent = val;
}

opacitySlider.addEventListener('input', () =>  {
	setOpacityText(opacitySlider.value);
	saveSettings();
	drawScan();
});

const thicknessSlider = document.getElementById('{uniqueID}_thickness');
const thicknessValue = document.getElementById('{uniqueID}_thickness_value');
thicknessSlider.addEventListener('input', () =>  {
	thicknessValue.textContent = thicknessSlider.value;
	saveSettings();
	drawScan();
});

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawScan();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	opacitySlider.value = loaded_data.opacity;
	setOpacityText(loaded_data.opacity);

	thicknessSlider.value = loaded_data.thickness;
	thicknessValue.innerText = loaded_data.thickness;

	colourpicker.value = loaded_data.color;
	throttle.value = loaded_data.throttle;
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
		opacity: opacitySlider.value,
		thickness: thicknessSlider.value,
		color: colourpicker.value,
		throttle: throttle.value
	}
	settings.save();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

async function drawScan() {

	const wid = canvas.width;
	const hei = canvas.height;

	ctx.setTransform(1,0,0,1,0,0);
	ctx.clearRect(0, 0, wid, hei);
	ctx.globalAlpha = opacitySlider.value;
	ctx.fillStyle = colourpicker.value;

	if(data == undefined || opacitySlider.value == 0.0){
		return;
	}

	const unit = view.getMapUnitsInPixels(1.0);
	const pixel = view.getMapUnitsInPixels(thicknessSlider.value);

	let pos = view.fixedToScreen({
		x: data.pose.translation.x,
		y: data.pose.translation.y,
	});

	ctx.setTransform(1,0,0,-1,pos.x, pos.y); //sx,0,0,sy,px,py
	const delta = parseInt(pixel/2);

	ctx.beginPath();
	for(let i = 0; i < data.points.length; i++){
		const x = data.points[i].x * unit - delta;
		const y = data.points[i].y * unit - delta;
		ctx.moveTo(x, y);
		ctx.lineTo(x + pixel, y);
		ctx.lineTo(x + pixel, y + pixel);
		ctx.lineTo(x, y + pixel);
		ctx.lineTo(x, y);
	}
	ctx.fill();
}

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawScan();
}

window.addEventListener("tf_fixed_frame_changed", drawScan);
window.addEventListener("view_changed", drawScan);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

//Topic

function radToDeg(val){
	return (val * (180/Math.PI)).toFixed(2)
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No laser scan endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	text_angle.innerText = "Angle: ?";
	text_frame.innerText = "TF Frame: ?";
	text_angleinc.innerText = "Angle increment: ?";
	text_pointscount.innerText = "Points: ?";
	text_scantime.innerText = "Scan time: ?";
	text_min.innerText = "Min: ?";
	text_max.innerText = "Max: ?";

	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const frameId = message.frameId || tf.fixed_frame;
		const hasWarning = message.frameId === "";
		const pose = tf.getAbsoluteTransform({ frameId, stamp: message.stamp });
		
		if(!pose){
			status.setError(`Required transform frame "${frameId}" not found.`);
			return;
		}

		text_angle.innerText = "Angle: "+radToDeg(message.angleMin)+"°"+" to "+radToDeg(message.angleMax)+"°";
		text_angleinc.innerText = "Angle increment: "+radToDeg(message.angleIncrement)+"°";
		text_frame.innerText = "TF frame: "+frameId;
		text_pointscount.innerText = "Points: "+message.ranges.length;
		text_scantime.innerText = "Scan time: "+message.scanTime.toFixed(5)+" s";
		text_min.innerText = "Min: "+message.rangeMin.toFixed(2)+" m";
		text_max.innerText = "Max: "+message.rangeMax.toFixed(2)+" m";

		let rotatedPointCloud = [];
		message.ranges.forEach(function (item, index) {
			if (item >= message.rangeMin && item <= message.rangeMax) {
				const angle = message.angleMin + index * message.angleIncrement;
				rotatedPointCloud.push(endpointService.applyRotation(
					{
						x: item * Math.cos(angle), 
						y: item * Math.sin(angle), 
						z: 0 
					}, 
					pose.rotation, 
					false
				));
			}
		});

		data = {};
		data.pose = pose;
		data.points = rotatedPointCloud
		drawScan();

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
		data = undefined;
		connect();
	},
});
endpointConfigurationEditor.refresh();
resizeScreen();

console.log("Laserscan Widget Loaded {uniqueID}")
