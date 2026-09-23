let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let tf = null;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.GRID_CELLS;
let endpointConfiguration = null;
let endpointConfigurationEditor;
let subscription = undefined;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let data = undefined;

const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const timestampCheckbox = document.getElementById('{uniqueID}_use_timestamp');
timestampCheckbox.addEventListener('change', () => {
	saveSettings();
	drawCells();
});

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');
opacitySlider.addEventListener('input', () =>  {
	opacityValue.textContent = opacitySlider.value;
	saveSettings();
	drawCells();
});

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawCells();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	opacitySlider.value = loaded_data.opacity ?? 1.0;
	opacityValue.innerText = opacitySlider.value;

	timestampCheckbox.checked = loaded_data.use_timestamp ?? false;

	colourpicker.value = loaded_data.color ?? "#74ce6c";
	throttle.value = loaded_data.throttle ?? 100;
}else{
	saveSettings();
}

// Update the icon colour when it's loaded or when the image source changes.
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
		color: colourpicker.value,
		throttle: throttle.value,
		use_timestamp: timestampCheckbox.checked,
	}
	settings.save();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

function transformFor(data) {
	const header = { frameId: data.frameId };
	if (timestampCheckbox.checked) {
		header.stamp = data.message.stamp;
	}
	return tf.getAbsoluteTransform(header);
}

async function drawCells() {

	ctx.setTransform(1,0,0,1,0,0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	if(!data){
		return;
	}

	ctx.globalAlpha = opacitySlider.value;
	ctx.fillStyle = colourpicker.value;

	const tf_pose = transformFor(data);
	if(!tf_pose){
		return;
	}

	const pos = view.fixedToScreen({
		x: tf_pose.translation.x,
		y: tf_pose.translation.y,
	});

	const matrix = view.quaterionToProjectionMatrix(tf_pose.rotation);
	ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], pos.x, pos.y); //sx,0,0,sy,px,py
	ctx.scale(1.0, -1.0);

	const unit = view.getMapUnitsInPixels(1.0);
	const wid = Math.abs(data.message.cellWidth) * unit;
	const hei = Math.abs(data.message.cellHeight) * unit;

	ctx.beginPath();
	for(let i = 0; i < data.message.cells.length; i++){
		const x = data.message.cells[i].x * unit - wid / 2 + 1;
		const y = data.message.cells[i].y * unit - hei / 2 + 1;
		ctx.moveTo(x, y);
		ctx.lineTo(x + wid - 1, y);
		ctx.lineTo(x + wid - 1, y + hei - 1);
		ctx.lineTo(x, y + hei - 1);
		ctx.lineTo(x, y);
	}
	ctx.fill();
}

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawCells();
}

window.addEventListener("tf_fixed_frame_changed", drawCells);
window.addEventListener("tf_changed", () => {
	if (data && data.frameId != tf.fixed_frame){
		drawCells();
	}
});

window.addEventListener("view_changed", drawCells);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

function getEndpointConfiguration() {
	const configuration = endpointConfigurationEditor.activeConfiguration;
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured endpoint.");
		return null;
	}
	return configuration;
}

function deliveryOptions() {
	const throttleRate = Number.parseInt(throttle.value, 10);
	return {
		throttleRate: Number.isFinite(throttleRate) && throttleRate >= 0 ? throttleRate : 0,
		queueLength: 1,
	};
}

function connect(){
	if(subscription !== undefined){
		subscription.unsubscribe();
		subscription = undefined;
	}

	const configuration = getEndpointConfiguration();
	if (!configuration) {
		return;
	}

	tf = endpointService.getTf(configuration.adapterId);
	status.setWarn("No data received.");

	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		if(message.cells.length === 0){
			status.setWarn("Received empty grid. Oh no! Anyway...");
			data = undefined;
			drawCells();
			return;
		}

		if(message.cellWidth === 0 || message.cellHeight === 0){
			status.setError("Grid cell size must be nonzero, received width="+message.cellWidth+" height="+message.cellHeight+".");
			data = undefined;
			drawCells();
			return;
		}

		let error = false;
		const frameId = message.frameId === "" ? tf.fixed_frame : message.frameId;
		if(message.frameId === ""){
			status.setWarn("Transform frame is an empty string, falling back to fixed frame. Fix your publisher ;)");
			error = true;
		}

		const pose = transformFor({ message, frameId });
		if(!pose){
			status.setError("Required transform frame \""+frameId+"\" not found.");
			data = undefined;
			drawCells();
			return;
		}

		data = { message, frameId };
		drawCells();

		if(!error){
			status.setOK();
		}
	}, deliveryOptions());

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
		saveSettings();
		connect();
	},
});

click_icon.addEventListener("click", (event) => {
	endpointConfigurationEditor.refresh();
});

endpointConfigurationEditor.refresh();
resizeScreen();

console.log("Gridcells Widget Loaded {uniqueID}")
