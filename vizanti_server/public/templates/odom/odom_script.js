let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let dbModule = await import(`${base_url}/js/modules/database.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let tf = endpointService.getTf();
let settings = persistentModule.settings;
let Status = StatusModule.Status;

const db = new dbModule.IndexedDatabase('odom_history');
await db.openDB();
const DB_KEY = "odom_pose_history_{uniqueID}";

let endpointConfiguration = null;
let endpointConfigurationEditor;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.ODOMETRY;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let subscription = undefined;

let sample_array = [];

let mode = "topic";
let raw_target = "";

const text_point_count = document.getElementById("{uniqueID}_points_text");
const text_total_dist = document.getElementById("{uniqueID}_distance_text");

const sourceMode = document.getElementById("{uniqueID}_source_mode");
const selectionbox = document.getElementById("{uniqueID}_tf_frame");
const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const drawarrows = document.getElementById('{uniqueID}_draw_arrows');
drawarrows.addEventListener('change', ()=>{
	saveSettings();
	drawHistory();
});

const drawpath = document.getElementById('{uniqueID}_draw_path');
drawpath.addEventListener('change', ()=>{
	saveSettings();
	drawHistory();
});

const save_history = document.getElementById('{uniqueID}_save_history');
save_history.addEventListener('change', ()=>{
	saveSettings();
	drawHistory();
});

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawHistory();
});

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

const historypicker = document.getElementById('{uniqueID}_history');
historypicker.addEventListener("input", (event) =>{
	saveSettings();

	while (sample_array.length > parseInt(historypicker.value)) {
		sample_array.shift();
	}

	drawHistory();
});

const clearHistoryButton = document.getElementById("{uniqueID}_clearhistory");
clearHistoryButton.addEventListener('click', ()=>{
	sample_array = [];
	db.setObject(DB_KEY, null);
	updateTextDisplay();
	drawHistory();
});

const downloadCSVButton = document.getElementById("{uniqueID}_downloadcsv");

downloadCSVButton.addEventListener('click', () => {

	function getCurrentDateTimeString() {
		const date = new Date();
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');

		return `${year}-${month}-${day}-${hours}-${minutes}`;
	}

	if(sample_array.length === 0){
		alert("No poses to export.");
		return;
	}

	let csv = "x,y,yaw\n";

	for(const pose of sample_array){
		csv += `${pose.x},${pose.y},${pose.yaw}\n`;
	}

	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.href = url;

	const safeTopic = `${raw_target}_in_${tf.fixed_frame}_`.replace(/[^\w\d_-]/g, "_")+getCurrentDateTimeString();
	link.download = `${safeTopic || "odom_history"}.csv`;

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	URL.revokeObjectURL(url);

	status.setOK("CSV downloaded.");
});

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
	mode = loaded_data.source_mode === "tf" ? "tf" : "topic";
	raw_target = loaded_data.tf_frame || "";
	sourceMode.value = mode;

	historypicker.value = loaded_data.history;
	drawarrows.checked = loaded_data.draw_arrows;
	drawpath.checked = loaded_data.draw_path;
	throttle.value = loaded_data.throttle;
	colourpicker.value = loaded_data.color ?? "#54db67";
	save_history.checked = loaded_data.save_history ?? true;
}else{
	saveSettings();
}

if(save_history.checked){
	await loadPoints();
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
		source_mode: mode,
		tf_frame: raw_target,
		history: historypicker.value,
		color: colourpicker.value,
		throttle: throttle.value,
		draw_arrows: drawarrows.checked,
		draw_path: drawpath.checked,
		save_history: save_history.checked
	}
	settings.save();
}

async function loadPoints(){
	const stored = await db.getObject(DB_KEY);
	if(stored instanceof Float32Array && stored.length % 3 === 0){
		for(let i = 0; i < stored.length; i += 3){
			sample_array.push({ x: stored[i], y: stored[i+1], yaw: stored[i+2] });
		}
		drawHistory();
	}
}

function savePoints(){
	const packed = new Float32Array(sample_array.length * 3);
	for(let i = 0; i < sample_array.length; i++){
		packed[i*3] = sample_array[i].x;
		packed[i*3+1] = sample_array[i].y;
		packed[i*3+2] = sample_array[i].yaw;
	}
	db.setObject(DB_KEY, packed);
}

//Rendering
async function drawHistory(){

	function drawArrow(height, tipwidth) {
		const half = height/2;
		ctx.moveTo(-half, -tipwidth); 
		ctx.lineTo(half, 0);
		ctx.lineTo(-half, tipwidth);
	}

	const wid = canvas.width;
    const hei = canvas.height;
	ctx.setTransform(1,0,0,1,0,0); 
	ctx.clearRect(0, 0, wid, hei);

	if(!drawarrows.checked && !drawpath.checked)
		return;

	if(sample_array.length < 2){
		status.setWarn("No data yet!");
		return;
	}

	ctx.lineWidth = 3;
	ctx.strokeStyle = colourpicker.value;
	ctx.fillStyle = colourpicker.value;
	ctx.beginPath();

	let view_points = [];
	for (let i = 0; i < sample_array.length; i++) {
		view_points[i] = view.fixedToScreen(sample_array[i]);
		view_points[i].yaw = sample_array[i].yaw;
	}

	//continuous line 
	if(drawpath.checked){
		ctx.moveTo(view_points[0].x, view_points[0].y);
		for (let i = 1; i < view_points.length; i++) {
			ctx.lineTo(view_points[i].x, view_points[i].y);
		}
		ctx.globalAlpha = 0.6;
		ctx.stroke();
	}

	//yaw indicator
	if(drawarrows.checked){
		ctx.beginPath();

		let prev_p = null;
		for (let i = 0; i < view_points.length; i++) {
			const p = view_points[i];
			if(prev_p === null || Math.hypot(p.x - prev_p.x, p.y - prev_p.y) > 20){
				ctx.setTransform(1,0,0,-1,p.x, p.y); //sx,0,0,sy,px,py
				ctx.rotate(p.yaw);
				drawArrow(15, 5);
				prev_p = p;
			}
		}

		ctx.globalAlpha = 1.0;
		ctx.fill();
	}
}


function updateTextDisplay(){

	function getDistance(posearray) {
		if (!Array.isArray(posearray) || posearray.length < 2)
			return 0;
		
		let dist = 0;
		for (let i = 0; i < posearray.length - 1; i++) {
			const pose1 = posearray[i];
			const pose2 = posearray[i + 1];
			const dx = pose2.x - pose1.x;
			const dy = pose2.y - pose1.y;
			dist += Math.sqrt(dx * dx + dy * dy);
		}
		return dist;
	}

	text_point_count.innerText = "Points: "+sample_array.length;
	let dist = getDistance(sample_array)

	if(dist > 1000.0){
		dist /= 1000.0
		text_total_dist.innerText = "Distance: "+dist.toFixed(3)+" km";
	}else if(dist < 1.0){
		dist *= 100.0
		text_total_dist.innerText = "Distance: "+dist.toFixed(1)+" cm";
	}else{
		text_total_dist.innerText = "Distance: "+dist.toFixed(2)+" m";
	}
}

let time_since_updated = Date.now();
function appendPose(pose){
	const pose2D = {
		x: pose.translation.x,
		y: pose.translation.y,
		yaw: pose.rotation.toEuler().h
	};

	if(sample_array.length > 0){
		const last = sample_array[sample_array.length-1];
		const delta = Math.hypot(last.x - pose2D.x, last.y - pose2D.y);
		if(delta > 0.03){
			sample_array.push(pose2D);
		}else{
			return false;
		}
	}else{
		sample_array.push(pose2D);
	}

	while (sample_array.length > parseInt(historypicker.value)) {
		sample_array.shift();
	}

	const now = Date.now();
	if(now - time_since_updated > 3000){
		updateTextDisplay();

		if(save_history.checked){
			savePoints();
		}

		time_since_updated = now;
	}

	return true;
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	if (mode !== "topic") return;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No odometry endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const frameId = message.frameId || tf.fixed_frame;
		const hasWarning = message.frameId === "";
		const frame = tf.absoluteTransforms[frameId];

		if(!frame){
			status.setError(`Required transform frame "${frameId}" not found.`);
			return;
		}

		const transformed = tf.transformPose(
			frameId, tf.fixed_frame, message.position, message.orientation
		);

		if(appendPose(transformed)){
			drawHistory();
			if (hasWarning) status.setWarn("An empty transform frame was treated as the fixed frame.");
			else status.setOK();
		}
	}, { throttleRate: parseInt(throttle.value), queueLength: 1 });

	saveSettings();
}

function loadFrames(){
	const frames = Array.from(tf.frame_list);
	selectionbox.innerHTML = frames.map((frame) => `<option value="${frame}">${frame}</option>`).join("");
	if (raw_target && frames.includes(raw_target)) selectionbox.value = raw_target;
	else if (frames.length > 0) raw_target = selectionbox.value;
	if (mode === "tf") saveSettings();
}

selectionbox.addEventListener("change", () => {
	raw_target = selectionbox.value;
	sample_array = [];
	saveSettings();
	drawHistory();
});

click_icon.addEventListener("click", () => {
	loadFrames();
	updateTextDisplay();
});

sourceMode.addEventListener("change", () => {
	mode = sourceMode.value;
	document.getElementById("{uniqueID}_endpoint_source").style.display = mode === "topic" ? "" : "none";
	document.getElementById("{uniqueID}_tf_source").style.display = mode === "tf" ? "" : "none";
	loadFrames();
	sample_array = [];
	saveSettings();
	connect();
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
		sample_array = [];
		connect();
	},
});
endpointConfigurationEditor.refresh();

document.getElementById("{uniqueID}_endpoint_source").style.display = mode === "topic" ? "" : "none";
document.getElementById("{uniqueID}_tf_source").style.display = mode === "tf" ? "" : "none";
loadFrames();
connect();

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawHistory();
}

let tf_throttle_stamp = 0;
window.addEventListener("tf_changed", ()=>{
	if(mode == "tf"){
		if (raw_target === "") loadFrames();
		const now = Date.now();
		if(now - tf_throttle_stamp >= parseInt(throttle.value)){
			const frame = tf.absoluteTransforms[raw_target];

			if(!frame){
				status.setError("Required transform frame \""+raw_target+"\" not found.");
				return;
			}

			if(appendPose(frame)){
				drawHistory();
				status.setOK();
				tf_throttle_stamp = now;
			}
		}
	}
});

window.addEventListener("tf_fixed_frame_changed", ()=>{
	sample_array = []; //TODO keep a ref to the old frame and trasform the history
	drawHistory();
});

window.addEventListener("view_changed", drawHistory);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("Odom Pose Tracker Widget Loaded {uniqueID}")
