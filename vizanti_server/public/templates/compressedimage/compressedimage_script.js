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

let img_offset_x = "-999";
let img_offset_y = "-999";
let last_natural_width = 400;
let last_natural_height = 250;

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const vwToVh = vw => (vw * window.innerWidth) / window.innerHeight;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.IMAGE;
let endpointConfiguration = null;
let endpointConfigurationEditor;

//persistent loading, so we don't re-fetch on every update
let stock_images = {};
stock_images["loading"] = await imageToDataURL("assets/img_loading.png");
stock_images["error"] = await imageToDataURL("assets/img_error.png");

let subscription = undefined;

const rotationbox = document.getElementById("{uniqueID}_rotation");

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];
const canvas = document.getElementById('{uniqueID}_image');
const imgpreview = document.getElementById('{uniqueID}_imgpreview');

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');
opacitySlider.addEventListener('input', () =>  {
	opacityValue.textContent = opacitySlider.value;
	saveSettings();
});

const widthSlider = document.getElementById('{uniqueID}_width');
const widthValue = document.getElementById('{uniqueID}_width_value');
widthSlider.addEventListener('input', () =>  {
	widthValue.textContent = widthSlider.value;
	saveSettings();
});

const resizePolicy = document.getElementById('{uniqueID}_resize_policy');
const responsiveWidthControls = document.getElementById('{uniqueID}_responsive_width_controls');
const customSizeControls = document.getElementById('{uniqueID}_custom_size_controls');
const customWidth = document.getElementById('{uniqueID}_custom_width');
const customHeight = document.getElementById('{uniqueID}_custom_height');

function validCustomSize(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) ? clamp(parsed, 1, 4096) : fallback;
}

function updateResizeControls() {
	const responsive = resizePolicy.value === "responsive";
	responsiveWidthControls.hidden = !responsive;
	customSizeControls.hidden = responsive;
}

resizePolicy.addEventListener('change', () => {
	updateResizeControls();
	saveSettings();
});

for (const control of [customWidth, customHeight]) {
	control.addEventListener('input', () => {
		control.value = validCustomSize(control.value, 1);
		saveSettings();
	});
}

const text_resolution = document.getElementById("{uniqueID}_resolution");
const text_datasize = document.getElementById("{uniqueID}_datasize");
const text_rate = document.getElementById("{uniqueID}_rate");
const text_bandwidth = document.getElementById("{uniqueID}_bandwidth");
const text_compression = document.getElementById("{uniqueID}_compression");
const text_type = document.getElementById("{uniqueID}_type");
const text_frame = document.getElementById("{uniqueID}_frame");

let arrival_times = [];
let arrival_bytes = [];

function base64ByteLength(data){
	if(data === undefined || data.length == 0)
		return 0;

	let padding = 0;
	if(data.endsWith("=="))
		padding = 2;
	else if(data.endsWith("="))
		padding = 1;

	return Math.floor(data.length * 3 / 4) - padding;
}

function formatBytes(bytes){
	if(bytes >= 1024 * 1024)
		return (bytes / (1024 * 1024)).toFixed(2)+" MB";

	if(bytes >= 1024)
		return (bytes / 1024).toFixed(1)+" kB";

	return bytes+" B";
}

function resetLiveData(){
	arrival_times = [];
	arrival_bytes = [];

	text_resolution.innerText = "Resolution: ?";
	text_datasize.innerText = "Data size: ?";
	text_rate.innerText = "Rate: ?";
	text_bandwidth.innerText = "Bandwidth: ?";
	text_compression.innerText = "Compression: ?";
	text_type.innerText = "Type: ?";
	text_frame.innerText = "Frame: ?";
}

function updateLiveData(message){
	const bytes = base64ByteLength(message.base64Data);
	
	arrival_times.push(performance.now());
	arrival_bytes.push(bytes);

	if(arrival_times.length > 20){
		arrival_times.shift();
		arrival_bytes.shift();
	}

	text_datasize.innerText = "Data size: "+formatBytes(bytes);
	text_compression.innerText = "Compression: "+message.compression.toUpperCase();
	text_type.innerText = "Type: "+(message.isDepth ? "Depth" : (message.encoding.startsWith("mono") || message.encoding == "8uc1" ? "Grayscale" : "Color"))+(message.encoding == "" ? "" : " ("+message.encoding+")");
	text_frame.innerText = "Frame: "+(message.frameId == "" ? "(empty)" : message.frameId);

	if(arrival_times.length > 1){
		const seconds = (arrival_times[arrival_times.length - 1] - arrival_times[0]) / 1000;
		const rate = (arrival_times.length - 1) / seconds;
		const mean_bytes = arrival_bytes.reduce((a, b) => a + b, 0) / arrival_bytes.length;
		text_rate.innerText = "Rate: "+rate.toFixed(1)+" Hz";
		text_bandwidth.innerText = "Bandwidth: "+formatBytes(mean_bytes * rate)+"/s";
	}
}

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

rotationbox.addEventListener("change", (event) => {
	saveSettings();
});

//Settings

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration
		?? legacyEndpointConfiguration(loaded_data.topic);

	img_offset_x = loaded_data.img_offset_x;
	img_offset_y = loaded_data.img_offset_y;

	throttle.value = loaded_data.throttle;

	opacitySlider.value = loaded_data.opacity;
	opacityValue.innerText = loaded_data.opacity;
	canvas.style.opacity = loaded_data.opacity;

	widthSlider.value = loaded_data.width;
	widthValue.innerText = loaded_data.width;
	rotationbox.value = loaded_data.rotation;
	resizePolicy.value = ["responsive", "contain", "cover", "stretch"].includes(loaded_data.resize_policy)
		? loaded_data.resize_policy : "responsive";
	customWidth.value = validCustomSize(loaded_data.custom_width, 400);
	customHeight.value = validCustomSize(loaded_data.custom_height, 300);

	last_natural_width = loaded_data.last_natural_width ?? 400;
	last_natural_height = loaded_data.last_natural_height ?? 300;

	canvas.style.transform = `translate(-50%, -50%) rotate(${loaded_data.rotation}deg)`;
	displayImageOffset(img_offset_x, img_offset_y);
}else{
	displayImageOffset(0, 100);
	saveSettings();
}

updateResizeControls();

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		opacity: opacitySlider.value,
		throttle: throttle.value,
		width: widthSlider.value,
		resize_policy: resizePolicy.value,
		custom_width: validCustomSize(customWidth.value, 400),
		custom_height: validCustomSize(customHeight.value, 300),
		img_offset_x: img_offset_x,
		img_offset_y: img_offset_y,
		rotation: rotationbox.value,
		last_natural_width: last_natural_width,
		last_natural_height: last_natural_height
	}
	settings.save();

	canvas.style.opacity = opacitySlider.value;
	canvas.style.transform = `translate(-50%, -50%) rotate(${rotationbox.value}deg)`;
	displayImageOffset(img_offset_x, img_offset_y);
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

async function getImage(src) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => reject(src);
        img.src = src;
    });
}

function connect(){

	resetLiveData();

	canvas.src = stock_images["loading"];
	displayImageOffset(img_offset_x, img_offset_y);

	if(subscription !== undefined){
		subscription.unsubscribe();
		subscription = undefined;
	}

	const configuration = getEndpointConfiguration();
	if (!configuration) {
		return;
	}

	status.setWarn("No data received.");

	let received = false;
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const src = `data:${message.mimeType};base64,${message.base64Data}`;

		updateLiveData(message);

		getImage(src)
			.then((img) => {
			    canvas.onload = () => {
			        last_natural_width = canvas.naturalWidth;
			        last_natural_height = canvas.naturalHeight;
			        text_resolution.innerText = "Resolution: "+canvas.naturalWidth+" x "+canvas.naturalHeight;
			        if(!received){

						//lightweight hackery to show depth in a more usable way, we'd need to re-render it to 8bit to do it properly
						if (message.isDepth) {
							canvas.style.filter = "brightness(600%)";
						} else {
							canvas.style.filter = "none";
						}

			            displayImageOffset(img_offset_x, img_offset_y);
			            status.setOK();
			            received = true;
			        }
			    };
			    canvas.src = src;
			})
			.catch((e) => {
				canvas.src = stock_images["error"];
				displayImageOffset(img_offset_x, img_offset_y);
				status.setError(e.message);
			});
	}, deliveryOptions());

	saveSettings();
}

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
		connect();
	},
});

icon.addEventListener("click", ()=> {
	endpointConfigurationEditor.refresh();
});

endpointConfigurationEditor.refresh();

//preview for definining position
let preview_active = false;

function onStart(event) {
	preview_active = true;
	document.addEventListener('mousemove', onMove);
	document.addEventListener('touchmove', onMove);
	document.addEventListener('mouseup', onEnd);
	document.addEventListener('touchend', onEnd);
}

function displayImageOffset(x, y){

	if(canvas.naturalWidth == 0)
		return;

	const rotation = ((parseFloat(rotationbox.value) % 360) + 360) % 360;
	const isSideways = (rotation === 90 || rotation === 270);
	let visualWidth;
	let visualHeight;
	if (resizePolicy.value === "responsive") {
		let imageWidth;
		let imageHeight;
		if (isSideways) {
			imageHeight = parseFloat(widthSlider.value);
			imageWidth = (imageHeight * last_natural_width) / vwToVh(last_natural_height);
		} else {
			imageWidth = parseFloat(widthSlider.value);
			imageHeight = (vwToVh(imageWidth) * last_natural_height) / last_natural_width;
		}

		const imageHeightVw = imageHeight * window.innerHeight / window.innerWidth;
		visualWidth = isSideways ? imageHeightVw : imageWidth;
		visualHeight = isSideways ? imageWidth * window.innerWidth / window.innerHeight : imageHeight;
		canvas.style.width = imageWidth + "vw";
		canvas.style.height = imageHeight + "vh";
		canvas.style.objectFit = "fill";
	} else {
		const imageWidth = validCustomSize(customWidth.value, 400);
		const imageHeight = validCustomSize(customHeight.value, 300);
		visualWidth = (isSideways ? imageHeight : imageWidth) / window.innerWidth * 100;
		visualHeight = (isSideways ? imageWidth : imageHeight) / window.innerHeight * 100;
		canvas.style.width = imageWidth + "px";
		canvas.style.height = imageHeight + "px";
		canvas.style.objectFit = resizePolicy.value === "stretch" ? "fill" : resizePolicy.value;
		canvas.style.objectPosition = "center";
	}

	// Clamp position using the actual visual extents, not the pre-rotation ones
	const minOffsetX = Math.min(visualWidth / 2, 50);
	const maxOffsetX = Math.max(100 - visualWidth / 2, 50);
	const minOffsetY = Math.min(visualHeight / 2, 50);
	const maxOffsetY = Math.max(100 - visualHeight / 2, 50);
	let offset_x = clamp(x, minOffsetX, maxOffsetX);
	let offset_y = clamp(y, minOffsetY, maxOffsetY);

	imgpreview.style.left = offset_x + "vw";
	imgpreview.style.top  = offset_y + "vh";

	canvas.style.left = offset_x + "vw";
	canvas.style.top  = offset_y + "vh";
}

window.addEventListener('resize', ()=>{
	displayImageOffset(img_offset_x, img_offset_y);
});

function onMove(event) {
	if (preview_active) {
		event.preventDefault();
		let currentX, currentY;
		if (event.type === "touchmove") {
			currentX = event.touches[0].clientX;
			currentY = event.touches[0].clientY;
		} else {
			currentX = event.clientX;
			currentY = event.clientY;
		}
		img_offset_x = currentX / window.innerWidth  * 100;
		img_offset_y = currentY / window.innerHeight * 100;
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

displayImageOffset(img_offset_x, img_offset_y);

console.log("Image Widget Loaded {uniqueID}")
