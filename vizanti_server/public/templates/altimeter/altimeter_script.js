let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let tf = endpointService.getTf();
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let settings = persistentModule.settings;
let Status = StatusModule.Status;

let MODES = {
	"altitude_positive": {dir: "altitude", invert: false},
	"altitude_negative": {dir: "altitude", invert: true},
	"depth_negative": {dir: "depth", invert: true},
	"depth_positive": {dir: "depth", invert: false},
};

let step = 1.0;
let meters = 0;
let meters_smooth = 0;
let target = NaN;

let frame = "";
let endpointConfiguration = null;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.FLOAT;
let endpointConfigurationEditor;

let subscription = undefined;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let img_offset_x = "0";

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

const arrow = document.getElementById('{uniqueID}_arrow');
const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const icon_bar = document.getElementById("icon_bar");
const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];
const modeSelector = document.getElementById("{uniqueID}_mode");
const stepBox = document.getElementById("{uniqueID}_step");

const text_altitude = document.getElementById("{uniqueID}_altitude_text");
const text_target = document.getElementById("{uniqueID}_target_text");

const imgpreview = document.getElementById('{uniqueID}_imgpreview');

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	modeSelector.value = loaded_data.mode;
	endpointConfiguration = loaded_data.endpoint_configuration ?? {
		mode: loaded_data.configuration_mode || "manual",
		robotModelId: loaded_data.robotmodel_id || "",
		manual: loaded_data.manual_endpoint_configuration || null,
		robotModel: loaded_data.robot_endpoint_configuration || null,
	};

	stepBox.value = loaded_data.step;

	step = loaded_data.step;
	img_offset_x = loaded_data.img_offset_x;
}else{
	img_offset_x = (document.querySelectorAll('.altimeter_canvas').length-1) * 110;
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		mode: modeSelector.value,
		endpoint_configuration: endpointConfiguration,
		step: step,
		img_offset_x: img_offset_x
	}
	settings.save();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function configuredFrameFor(configuration) {
	if (!configuration) {
		return "";
	}

	let adapterConfiguration = configuration.manualAdapterConfiguration;
	if (configuration.mode === "robotmodel") {
		const robotModel = vehicleSelectionModule.getRegisteredVehicles()
			.find((vehicle) => vehicle.id === configuration.robotModelId);
		adapterConfiguration = robotModel ? robotModel.adapterConfiguration : null;
	}

	const configuredFrame = adapterConfiguration && adapterConfiguration.values
		? adapterConfiguration.values.tfFrame : "";
	return typeof configuredFrame === "string" ? configuredFrame.trim() : "";
}

function applyConfiguredFrame(configuration) {
	const configuredFrame = configuredFrameFor(configuration);
	if (configuredFrame === "") {
		return;
	}

	frame = configuredFrame;
	meters = getMeters();
	drawWidget();
}

//topic
function connect(){

	const activeConfiguration = activeEndpointConfiguration();
	if(!activeConfiguration || !activeConfiguration.endpoint){
		target = NaN;
		text_target.innerText = "Target: N/A";
		return;
	}

	if(subscription !== undefined){
		subscription.unsubscribe();
	}

	subscription = endpointService.subscribe(activeConfiguration, endpointMessageType, (message) => {
		const value = message.value;
		const mode = MODES[modeSelector.value];
		target = Math.abs(value);
		if(value > 0){
			if(mode.dir == "depth" && mode.invert)
				target = NaN;

			if(mode.dir == "altitude" && mode.invert)
				target = NaN;

		}else if (value < 0){
			if(mode.dir == "depth" && !mode.invert)
				target = NaN;

			if(mode.dir == "altitude" && !mode.invert)
				target = NaN;
		}

		if(isNaN(target))
			text_target.innerText = "Target: N/A";
		else
			text_target.innerText = "Target: "+target.toFixed(3)+" m";
		
		drawWidget();
	});

	saveSettings();
}

function publishTarget(value){

	const activeConfiguration = activeEndpointConfiguration();
	if(!activeConfiguration || !activeConfiguration.endpoint)
		return;

	if(MODES[modeSelector.value].invert)
		value = -value;

	endpointService.publish(activeConfiguration, guiMessages.createFloat(value));
}

function getMeters(){
	const robotframe = tf.absoluteTransforms[frame];
	if(robotframe)
	{
		const mode = MODES[modeSelector.value];
		let z_meters = robotframe.translation.z;

		if(mode.invert)
			z_meters = -z_meters;

		if(z_meters < 0)
			z_meters = 0;

		status.setOK();
		return parseFloat(z_meters.toFixed(3));
	}
	else
	{
		status.setError("Required transform frame \""+frame+"\" not found.");
		return 0;
	}
}

function drawTarget(flip_offset, flip_mult, pos){
	ctx.fillStyle = "#e3df6f";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(flip_offset, pos-25);
	ctx.lineTo(flip_offset+ 25 * flip_mult, pos);
	ctx.lineTo(flip_offset+ 25 * flip_mult, pos);
	ctx.lineTo(flip_offset, pos+25);
	ctx.lineTo(flip_offset, pos-25);
	ctx.fill();
}

function drawDepth(){

	const hei = canvas.height;
	const centerY = hei/2;
    const pixelOffset = (meters_smooth / step) * -100 + centerY;

	const flip = img_offset_x > window.innerWidth/2;
	const flip_offset = flip ? 110: 0;
	const flip_mult = flip ? -1: 1;

	ctx.fillStyle = "#4070bfff";
	ctx.fillRect(flip ? 60: 0, pixelOffset-50, 50, 50);

	ctx.strokeStyle = "lightgray";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let y = pixelOffset, x = 0; y <= hei; y += 10, x+=1) {
		if(x % 5 == 0 || y < 0)
			continue;

		ctx.moveTo(flip_offset, y);
		ctx.lineTo(flip_offset + 25 * flip_mult, y);
	}
	ctx.stroke();

	ctx.strokeStyle = "white";
	ctx.lineWidth = 2;

	ctx.font = "bold 16px Monospace";
	ctx.fillStyle = "white";
	ctx.textAlign = flip ? "right" : "left";

	ctx.beginPath();
	let lineCount = 0.0;
	for (let y = pixelOffset, x = 0; y <= hei; y += 50, x+=1) {

		if(y < 0){
			if(x % 2 == 0)
				lineCount += step;
			continue;
		}
			
		if(x % 2 == 0){
			ctx.moveTo(flip_offset, y);
			ctx.lineTo(flip_offset + 50 * flip_mult, y);

			ctx.fillText(Number.isInteger(lineCount) ? lineCount : lineCount.toFixed(1), 55, y + 4);
			lineCount += step;
		}else{
			ctx.moveTo(flip_offset, y);
			ctx.lineTo(flip_offset + 35 * flip_mult, y);
		}
	}
	ctx.stroke();

	if(!isNaN(target)){
		const pos = pixelOffset + ((target / step) * 100);
		drawTarget(flip_offset, flip_mult, pos);
	}
}

function drawAltitude(){

	const hei = canvas.height;
	const centerY = hei/2;
    const pixelOffset = (meters_smooth / step) * 100 + centerY;

	const flip = img_offset_x > window.innerWidth/2;
	const flip_offset = flip ? 110: 0;
	const flip_mult = flip ? -1: 1;

	ctx.fillStyle = "#5a9558ff";
	ctx.fillRect(flip ? 60: 0, pixelOffset, 50, 50);

	ctx.strokeStyle = "lightgray";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let y = pixelOffset, x = 0; y >= 0; y -= 10, x+=1) {
		if(x % 5 == 0 || y > hei)
			continue;

		ctx.moveTo(flip_offset, y);
		ctx.lineTo(flip_offset + 25 * flip_mult, y);
	}
	ctx.stroke();

	ctx.strokeStyle = "white";
	ctx.lineWidth = 2;

	ctx.font = "bold 16px Monospace";
	ctx.fillStyle = "white";
	ctx.textAlign = flip ? "right" : "left";

	ctx.beginPath();
	let lineCount = 0.0;
	for (let y = pixelOffset, x = 0; y >= 0; y -= 50, x+=1) {

		if(y > hei){
			if(x % 2 == 0)
				lineCount += step;
			continue;
		}

		if(x % 2 == 0){
			ctx.moveTo(flip_offset, y);
			ctx.lineTo(flip_offset + 50 * flip_mult, y);

			ctx.fillText(Number.isInteger(lineCount) ? lineCount : lineCount.toFixed(1), 55, y + 4);
			lineCount += step;
		}else{
			ctx.moveTo(flip_offset, y);
			ctx.lineTo(flip_offset + 35 * flip_mult, y);
		}

	}
	ctx.stroke();

	if(!isNaN(target)){
		const pos = pixelOffset + ((target / step) * -100);
		drawTarget(flip_offset, flip_mult, pos);

	}
}

async function drawWidget() {
	const mode = MODES[modeSelector.value];

	if(mode.dir === "depth")
		text_altitude.innerText = "Depth: "+meters.toFixed(3)+" m";
	else
		text_altitude.innerText = "Altitude: "+meters.toFixed(3)+" m";

	ctx.clearRect(0, 0, canvas.width, canvas.height);

 	if(mode.dir === "depth"){
		drawDepth();
	}else{
		drawAltitude();
	}
}

function enqueueRender() {
	if(Math.abs(meters - meters_smooth) > step * 0.01){
		meters_smooth = meters_smooth * 0.95 + meters * 0.05;
		drawWidget();
	}

	window.requestAnimationFrame(enqueueRender);
}

function resizeScreen(){
	canvas.width = 110;
	canvas.height = window.innerHeight - icon_bar.offsetHeight;

	canvas.style.height = (window.innerHeight - icon_bar.offsetHeight) +"px";
	canvas.style.width = "110px";

	if(MODES[modeSelector.value].dir == "depth")
		arrow.style.bottom = (canvas.height/2 - 60) +"px";
	else
		arrow.style.bottom = (canvas.height/2 - 60) +"px";

	drawWidget();
}

window.addEventListener("tf_fixed_frame_changed", drawWidget);
window.addEventListener("tf_changed", ()=>{
	let new_val = getMeters();
	if(new_val != meters){
		meters = new_val;
		drawWidget();
	}
});

window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);
window.addEventListener("iconbar_height_change", resizeScreen);

modeSelector.addEventListener("change", (event) => {
	target = NaN;
	text_target.innerText = "Target: N/A";
	saveSettings();
	refreshStyleSetup();
	drawWidget();
});

stepBox.addEventListener("change", (event) =>{	
	step = Math.min(Math.max(0.1, parseFloat(stepBox.value)), 1000);
	saveSettings();
	refreshStyleSetup();
	drawWidget();
});


endpointConfigurationEditor = createEndpointConfiguration({
	container: document.getElementById("{uniqueID}_endpoint_configuration"),
	endpointService,
	guiMessageType: endpointMessageType,
	endpointType: "topic",
	configuration: endpointConfiguration,
	getRobotModels: vehicleSelectionModule.getRegisteredVehicles,
	onChange(configuration) {
		endpointConfiguration = configuration;
		applyConfiguredFrame(configuration);
		saveSettings();
		connect();
	},
});

icon.addEventListener("click", ()=>{
	endpointConfigurationEditor.refresh();
});

resizeScreen();
endpointConfigurationEditor.refresh();

//targeting
function getEventXY(event){
	// touchend has empty event.touches — must read from changedTouches
	const touch = event.changedTouches?.[0] ?? event.touches?.[0] ?? event;
	return [touch.clientX, touch.clientY];
}

function getEventLocalXY(event){

	const [globalX, globalY] = getEventXY(event);

	const rect = event.target.getBoundingClientRect();
	let x = globalX - rect.left;
	let y = globalY - rect.top;

	//are we flipped
	if(img_offset_x > window.innerWidth/2)
		x = rect.width - x;

	return [x, y];
}

function setTargetFromPixels(y){
	
	const centerY = canvas.height/2;
	let newtgt = 0;

	if(MODES[modeSelector.value].dir == "depth"){
		newtgt = ((y - centerY) / 100 + (meters_smooth / step)) * step;
	}else{
		newtgt = ((y - centerY) / -100 + (meters_smooth / step)) * step;
	}

	if(newtgt > -1){
		publishTarget(newtgt > 0 ? newtgt: 0);
	}
}

let targeting_active = false;
let targeting_point = {
	x: 0, 
	y: 0
};

function onTargetStart(event) {

	const configuration = activeEndpointConfiguration();
	if(!configuration || !configuration.endpoint)
		return;

	const [x, y] = getEventLocalXY(event);
	if(x > 30)
		return;

	const [globalX, globalY] = getEventXY(event);

	targeting_active = true;
	targeting_point.x = globalX;
	targeting_point.y = globalY;

	document.addEventListener('mouseup', onTargetEnd);
	document.addEventListener('touchend', onTargetEnd);
}

function onTargetEnd(event) {

	const configuration = activeEndpointConfiguration();
	if(!configuration || !configuration.endpoint)
		return;

	targeting_active = false;
	document.removeEventListener('mouseup', onTargetEnd);
	document.removeEventListener('touchend', onTargetEnd);

	const [globalX, globalY] = getEventXY(event);

	if(Math.hypot(targeting_point.y - globalY, targeting_point.x - globalX) < 15){
		const [x, y] = getEventLocalXY(event);
		setTargetFromPixels(y);
	}
}
  
canvas.addEventListener('mousedown', onTargetStart);
canvas.addEventListener('touchstart', onTargetStart);


//preview for definining position
let preview_active = false;

function refreshStyleSetup(){
	imgpreview.style.left = img_offset_x + canvas.width/2 + "px";
	canvas.style.left = img_offset_x +"px";

	let color;
	if(MODES[modeSelector.value].dir == "depth"){
		arrow.src = "assets/altimeter_arrow.svg"
		icon.src = "assets/altimeter.svg";
		color = "#4070bfff";
	}else{
		arrow.src = "assets/altimeter_arrow_green.svg";
		icon.src = "assets/altimeter_green.svg";
		color = "#5a9558ff";
	}

	if(img_offset_x > window.innerWidth/2){
		canvas.style.borderLeft = "5px none transparent";
		canvas.style.borderRight = "5px solid "+color;
		canvas.style.backgroundImage = "linear-gradient(to left, rgba(0, 0, 0, 0.589) , transparent)";
		icon.style.transform = "rotate(180deg)";

		arrow.style.left = (img_offset_x + 55) +"px";
		arrow.style.transform = "translateY(-50%) rotate(180deg)";
	}else{

		canvas.style.borderRight = "5px none transparent";
		canvas.style.borderLeft = "5px solid "+color;
		canvas.style.backgroundImage = "linear-gradient(to right, rgba(0, 0, 0, 0.589) , transparent)";
		icon.style.transform = "";

		arrow.style.left = img_offset_x +"px";
		arrow.style.transform = "translateY(-50%)";
	}
}

window.addEventListener('resize', ()=>{
	refreshStyleSetup();
});

function onStart(event) {
	preview_active = true;
	document.addEventListener('mousemove', onMove);
	document.addEventListener('touchmove', onMove);
	document.addEventListener('mouseup', onEnd);
	document.addEventListener('touchend', onEnd);
}

function onMove(event) {
	if (preview_active) {
		event.preventDefault();
		const wid = window.innerWidth-5;
		let [currentX, currentY] = getEventXY(event);

		if(currentX > wid/2){
			currentX = wid - currentX + 110;
			img_offset_x = wid - parseInt(currentX/110)*110;
		}else{
			img_offset_x = parseInt(currentX/110)*110;
		}

		refreshStyleSetup();
		saveSettings();
	}
}

function onEnd() {
	preview_active = false;
	document.removeEventListener('mousemove', onMove);
	document.removeEventListener('touchmove', onMove);
	document.removeEventListener('mouseup', onEnd);
	document.removeEventListener('touchend', onEnd);
}
  
imgpreview.addEventListener('mousedown', onStart);
imgpreview.addEventListener('touchstart', onStart);

refreshStyleSetup();
enqueueRender();

//manual targeting
document.getElementById("{uniqueID}_manual_target").addEventListener("click", async (event) =>{

	let value = await prompt("Enter target "+MODES[modeSelector.value].dir+" (meters, positive only):", "0.0");
	if (value != null) {
		publishTarget(Math.abs(value));
		drawWidget();
	}
});

console.log("Altimeter Widget Loaded {uniqueID}")
