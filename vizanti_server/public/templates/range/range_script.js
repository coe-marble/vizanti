let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let tf = endpointService.getTf();
let settings = persistentModule.settings;
let Status = StatusModule.Status;

let endpointConfiguration = null;
let endpointConfigurationEditor;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.RANGE;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;

let data = {};

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');

const text_range = document.getElementById("{uniqueID}_rangetext");
const text_min = document.getElementById("{uniqueID}_rangemintext");
const text_max = document.getElementById("{uniqueID}_rangemaxtext");
const text_fov = document.getElementById("{uniqueID}_fovtext");
const text_type = document.getElementById("{uniqueID}_typetext");

opacitySlider.addEventListener('input', () =>  {
	opacityValue.textContent = opacitySlider.value;
	saveSettings();
});

const decay = document.getElementById('{uniqueID}_decay');
decay.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	opacitySlider.value = loaded_data.opacity;
	opacityValue.innerText = loaded_data.opacity;

	decay.value = loaded_data.decay ?? 2000;
	throttle.value = loaded_data.throttle ?? 100;
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		opacity: opacitySlider.value,
		decay: decay.value,
		throttle: throttle.value
	}
	settings.save();
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

async function drawRanges() {

	function drawCircle(min_size, max_size) {
        ctx.beginPath();
        ctx.arc(0, 0, (min_size+max_size)/2, 0, 2 * Math.PI);
        ctx.closePath();
		ctx.lineWidth = max_size - min_size;
        ctx.stroke();
		ctx.lineWidth = 1;
	  }

	function drawPizza(start_angle, end_angle, min_len, max_len){
        ctx.beginPath();
        ctx.arc(0, 0, min_len, start_angle, end_angle);
        ctx.lineTo(max_len * Math.cos(end_angle), max_len * Math.sin(end_angle));
        ctx.arc(0, 0, max_len, end_angle, start_angle, true);
        ctx.lineTo(min_len * Math.cos(start_angle), min_len * Math.sin(start_angle));
        ctx.closePath();
        ctx.fill();
	} 

	const unit = view.getMapUnitsInPixels(1.0);

	const wid = canvas.width;
	const hei = canvas.height;

	ctx.setTransform(1,0,0,1,0,0);
	ctx.clearRect(0, 0, wid, hei);
	ctx.globalAlpha = opacitySlider.value;

	let current_time = new Date();

	for (const [key, sample] of Object.entries(data)) {

		//skip old messages
		if(decay.value > 0 && current_time - sample.stamp > decay.value)
			continue;

		if(sample.max_range == 0)
			continue;

		const pos = view.fixedToScreen({
			x: sample.pose.translation.x,
			y: sample.pose.translation.y,
		});

		const start_angle = -sample.field_of_view/2;
		const end_angle = sample.field_of_view/2;

		ctx.setTransform(1,0,0,-1,pos.x, pos.y); //sx,0,0,sy,px,py
		ctx.rotate(sample.yaw);

		if(sample.cone_half_width < sample.max_range)
		{
			ctx.fillStyle = "#33414e96";
			drawPizza(start_angle, end_angle, unit*sample.min_range, unit*sample.max_range, unit*sample.cone_half_width)

			ctx.fillStyle = "#5eb4ffff";
			let minarc = unit*sample.range-10;
	
			if(minarc < 0)
				minarc = 1;
	
			drawPizza(start_angle, end_angle, minarc, unit*sample.range, unit*sample.cone_half_width)
			
		}
		else
		{
			ctx.strokeStyle = "#33414e96";
			const scale = sample.cone_half_width / sample.max_range;
			const min_range = sample.min_range * scale * unit;
			const range = sample.range * scale * unit;

			drawCircle(min_range, unit*sample.cone_half_width);

			ctx.strokeStyle = "#5eb4ffff";
			let minarc = range-10;
			if(minarc < 0)
				minarc = 1;

			drawCircle(minarc, range)

		}

		yieldToMainThread();

	}
}

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawRanges();
}

window.addEventListener("tf_fixed_frame_changed", drawRanges);
window.addEventListener("view_changed", drawRanges);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

const RADIATION_TYPE = {
	0: "Ultrasound",
	1: "Infrared"
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No range endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");	
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const frameId = message.frameId || tf.fixed_frame;
		const hasWarning = message.frameId === "";
		const pose = tf.getAbsoluteTransform({ frameId, stamp: message.stamp });

		if(!pose){
			status.setError(`Required transform frame "${frameId}" not found.`);
			return;
		}

		text_range.innerText = `Range: ${message.range.toFixed(3)} m`;
		text_min.innerText = `Min: ${message.minRange.toFixed(3)} m`;
		text_max.innerText = `Max: ${message.maxRange.toFixed(3)} m`;
		text_fov.innerText = `Field of view: ${(message.fieldOfView * (180 / Math.PI)).toFixed(2)}°`;
		text_type.innerText = `Type: ${RADIATION_TYPE[message.radiationType]}`;

		const front_vector = endpointService.applyRotation(
			{
				x: message.maxRange,
				y: 0,
				z: 0 
			}, 
			pose.rotation, 
			false
		);

		//calculate the new values for displaying the cone in a rotated projection
		const yaw = Math.atan2(front_vector.y, front_vector.x);
		const ratio = Math.hypot(front_vector.y, front_vector.x) / message.maxRange;

		const cone_half_width = Math.tan(message.fieldOfView * 0.5) * message.maxRange;
		const ratio_fov = 2 * Math.atan(cone_half_width / (ratio * message.maxRange));

		data[frameId] = {
			yaw: yaw,
			cone_half_width: cone_half_width,
			field_of_view: ratio_fov,
			min_range: ratio * message.minRange,
			max_range: ratio * message.maxRange,
			range: ratio * message.range,
			type: message.radiationType,
			pose: pose,
			stamp: new Date()
		}
		drawRanges();

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
		data = {};
		connect();
	},
});
endpointConfigurationEditor.refresh();
resizeScreen();

console.log("Range Widget Loaded {uniqueID}")
