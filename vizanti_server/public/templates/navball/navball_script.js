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
let tf = endpointService.getTf();
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;

let offset_x = "-999";
let offset_y = "-999";

const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.IMU;
let endpointConfiguration = null;
let endpointConfigurationEditor;
let imuSubscription = undefined;
let sourceMode = "imu";
let tfFrame = "";

//all angles summed need to move at least this much to trigger an update
const angleDelta = 0.001;

let prev_pitch = 0;
let prev_yaw = 0;
let prev_roll = 0;

let pitch = 0;
let yaw = 0; 
let roll = 0;

let quat = new Quaternion();
let quat_smooth = new Quaternion();

//precomputed pixels
let lut_px;
let lut_py;
let lut_pz;
let lut_index;
let lut_size = 0;
let imageData
let data;

let textureInvLoaded = false;
let textureLoaded = false;
let overlayLoaded = false;
let centerLoaded = false;

let canvasSizeChanged = false;
let renderOnce = true;
let textureData;
let textureDataInv;

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const vwToVh = vw => (vw * window.innerWidth) / window.innerHeight;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

//persistent loading, so we don't re-fetch on every update
let stock_images = {};
stock_images["loading"] = await imageToDataURL("assets/tile_loading.png");
stock_images["error"] = await imageToDataURL("assets/tile_error.png");

const angleModeBox = document.getElementById('{uniqueID}_angle_mode');
const sourceModeBox = document.getElementById('{uniqueID}_source_mode');
const endpointContainer = document.getElementById("{uniqueID}_endpoint_configuration");
const tfSourceContainer = document.getElementById("{uniqueID}_tf_source");
const tfFrameSelector = document.getElementById("{uniqueID}_tf_frame");
const altRollCheckbox = document.getElementById('{uniqueID}_alt_roll');

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];
const canvas = document.getElementById('{uniqueID}_canvas');
const imgpreview = document.getElementById('{uniqueID}_imgpreview');

const text_pitch = document.getElementById("{uniqueID}_pitch");
const text_roll = document.getElementById("{uniqueID}_roll");
const text_yaw = document.getElementById("{uniqueID}_yaw");
const text_heading = document.getElementById("{uniqueID}_heading");
const text_quaternion = document.getElementById("{uniqueID}_quaternion");

const text_gyro_x = document.getElementById("{uniqueID}_gyro_x");
const text_gyro_y = document.getElementById("{uniqueID}_gyro_y");
const text_gyro_z = document.getElementById("{uniqueID}_gyro_z");

const text_accel_x = document.getElementById("{uniqueID}_accel_x");
const text_accel_y = document.getElementById("{uniqueID}_accel_y");
const text_accel_z = document.getElementById("{uniqueID}_accel_z");

const text_frame_id = document.getElementById("{uniqueID}_frame_id");

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

const throttle = document.getElementById('{uniqueID}_throttle');
throttle.addEventListener("input", (event) =>{
	saveSettings();
	connect();
});

angleModeBox.addEventListener('change', saveSettings);
altRollCheckbox.addEventListener('change', saveSettings);

const texture = new Image();
texture.src = 'assets/navball_texture.jpg';
texture.onload = () => {
	const textureCanvas = document.createElement('canvas');
	textureCanvas.width = texture.width;
	textureCanvas.height = texture.height;

	const textureCtx = textureCanvas.getContext('2d');
	textureCtx.drawImage(texture, 0, 0);
	textureData = textureCtx.getImageData(0, 0, texture.width, texture.height);

	textureLoaded = true;
};

const texture_inv = new Image();
texture_inv.src = 'assets/navball_invtex.jpg';
texture_inv.onload = () => {
	const textureInvCanvas = document.createElement('canvas');
	textureInvCanvas.width = texture_inv.width;
	textureInvCanvas.height = texture_inv.height;

	const textureInvCtx = textureInvCanvas.getContext('2d');
	textureInvCtx.drawImage(texture_inv, 0, 0);
	textureDataInv = textureInvCtx.getImageData(0, 0, texture_inv.width, texture_inv.height);

	textureInvLoaded = true;
};


const overlay = new Image();
overlay.src = 'assets/navball_overlay.png';
overlay.onload = () => {
	overlayLoaded = true;
};

const center = new Image();
center.src = 'assets/navball_center.png';
center.onload = () => {
	centerLoaded = true;
};


//Settings

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
	sourceMode = loaded_data.source_mode === "tf" ? "tf" : "imu";
	tfFrame = typeof loaded_data.tf_frame === "string" ? loaded_data.tf_frame : "";

	offset_x = loaded_data.offset_x ?? 50;
	offset_y = loaded_data.offset_y ?? 95;

	throttle.value = loaded_data.throttle ?? 30;

	opacitySlider.value = loaded_data.opacity ?? 0.85;
	opacityValue.innerText = opacitySlider.value;
	canvas.style.opacity = opacitySlider.value;

	widthSlider.value = loaded_data.width ?? 10;
	widthValue.innerText = widthSlider.value;

	angleModeBox.value = loaded_data.angle_mode ?? "horizon_fake";
	altRollCheckbox.checked = loaded_data.alt_roll ?? false;

	displayImageOffset(offset_x, offset_y);
}else{
	displayImageOffset(50, 95);
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		source_mode: sourceMode,
		tf_frame: tfFrame,
		opacity: opacitySlider.value,
		throttle: throttle.value,
		width: widthSlider.value,
		offset_x: offset_x,
		offset_y: offset_y,
		angle_mode: angleModeBox.value,
		alt_roll: altRollCheckbox.checked
	}
	settings.save();

	canvas.style.opacity = opacitySlider.value;
	displayImageOffset(offset_x, offset_y);
}


//Canvas setup
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function setupCanvas() {

	const width = canvas.width;
	const height = canvas.height;

	const radius = width / 2;
	const radiusSq = radius * radius;
	const invRadius = 1 / radius;
	
	imageData = ctx.createImageData(width, height);
	data = imageData.data;
	
	let pixelCount = 0;
	for (let y = 0; y < height; y++) {
		const dy = y - radius;
		for (let x = 0; x < width; x++) {
			const dx = x - radius;
			const distSq = dx * dx + dy * dy;
			if (distSq <= radiusSq * 0.76) {
				pixelCount++;
			}
		}
	}

	lut_size = pixelCount;
	lut_px = new Float32Array(lut_size);
	lut_py = new Float32Array(lut_size);
	lut_pz = new Float32Array(lut_size);
	lut_index = new Uint32Array(lut_size);
	
	let i = 0;
	for (let y = 0; y < height; y++) {
		const dy = y - radius;
		const dySq = dy * dy;
		for (let x = 0; x < width; x++) {
			const dx = x - radius;
			const distSq = dx * dx + dySq;
			
			if (distSq <= radiusSq * 0.76) {
				const dz = Math.sqrt(radiusSq - distSq);
				
				// Store in our new SoA structure
				lut_px[i] = dx * invRadius;
				lut_py[i] = dy * invRadius;
				lut_pz[i] = dz * invRadius;
				
				const pixelIndex = (y * width + x) * 4;
				lut_index[i] = pixelIndex;
				
				data[pixelIndex + 3] = 255; // Set alpha once
				i++;
			}
		}
	}

	canvasSizeChanged = false;
	renderOnce = true;
}

//Topic

function renderNavball() {

	if(!textureLoaded || !overlayLoaded  || !textureInvLoaded || !settings["{uniqueID}"])
		return;

	if(canvasSizeChanged){
		setupCanvas();
	}

	const mode = settings["{uniqueID}"].angle_mode;
	const alt_roll = settings["{uniqueID}"].alt_roll;

	const interpolator = quat_smooth.slerp(quat);
	quat_smooth = interpolator(0.1);

	const euler = quat_smooth.toEuler();
	let pitch = euler.pitch;
	let yaw = euler.h; 
	let roll = euler.g;

 	const dp = Math.abs(prev_pitch - pitch);
	const dy = Math.abs(prev_yaw - yaw);
	const dr = Math.abs(prev_roll - roll);

	if (dp + dy + dr < angleDelta && !renderOnce)
		return;

	const width = canvas.width;
	const height = canvas.height;

	const texWidth = texture.width;
	const texHeight = texture.height;
	const invPI = 1 / Math.PI;
	const texWidthMinus1 = texWidth - 1;
	const texHeightMinus1 = texHeight - 1;
	let texturePixels = textureData.data;

	prev_pitch = pitch;
	prev_yaw = yaw;
	prev_roll = roll;

	let true_roll = roll;

	if(mode == "horizon_true"){
		pitch = -pitch;
		yaw = -yaw + Math.PI/2;
		roll = roll + Math.PI;
		true_roll = -roll + Math.PI;
		texturePixels = textureDataInv.data;
	}else if(mode == "horizon_fake"){
		yaw = yaw - Math.PI/2;
		roll = roll + Math.PI;
		true_roll = alt_roll ? roll + Math.PI : -roll + Math.PI;
	}else{
		pitch = pitch;
		yaw = yaw - Math.PI/2;
		roll = -roll + Math.PI;
	}

	if(alt_roll){
		roll = Math.PI;
	}

	const cosP = Math.cos(pitch);
	const sinP = Math.sin(pitch);
	const cosY = Math.cos(yaw);
	const sinY = Math.sin(yaw);
	const cosR = Math.cos(roll);
	const sinR = Math.sin(roll);
	
	// Pre-calculate the combined rotation matrix
	const m11 = cosY * cosR + sinY * sinP * sinR;
	const m12 = cosP * sinR;
	const m13 = -sinY * cosR + cosY * sinP * sinR;
	
	const m21 = -cosY * sinR + sinY * sinP * cosR;
	const m22 = cosP * cosR;
	const m23 = sinY * sinR + cosY * sinP * cosR;
	
	const m31 = sinY * cosP;
	const m32 = -sinP;
	const m33 = cosY * cosP;
	
	for (let i = 0; i < lut_size; i++) {
		const px = lut_px[i];
		const py = lut_py[i];
		const pz = lut_pz[i];
		
		// Apply the single combined rotation
		const rot_px = px * m11 + py * m21 + pz * m31;
		const rot_py = px * m12 + py * m22 + pz * m32;
		const rot_pz = px * m13 + py * m23 + pz * m33;
		
		// Convert to spherical coords
		const theta = Math.atan2(rot_px, rot_pz);
		const phi = Math.asin(rot_py);
		
		const u = (-theta * invPI + 1) * 0.5;
		const v = 0.5 - phi * invPI;
		
		const texX = (u * texWidthMinus1) | 0;
		const texY = (v * texHeightMinus1) | 0;
		const texIndex = (texY * texWidth + texX) * 4;
		
		const pixelIndex = lut_index[i];
		data[pixelIndex] = texturePixels[texIndex];
		data[pixelIndex + 1] = texturePixels[texIndex + 1];
		data[pixelIndex + 2] = texturePixels[texIndex + 2];
	}
	
	ctx.setTransform(1,0,0,1,0,0); 
	ctx.putImageData(imageData, 0, 0);

	if(centerLoaded){
		ctx.setTransform(1,0,0,1,width/2, height/2); 
		if(alt_roll)
			ctx.rotate(true_roll);
		ctx.drawImage(center, -width/2, -height/2, width, height);
	}

	if (overlayLoaded) {
		ctx.setTransform(1,0,0,1,width/2, height/2); 
		if(!alt_roll)
			ctx.rotate(true_roll);
		ctx.drawImage(overlay, -width/2, -height/2, width, height);
	}

	renderOnce = false;
}

function updateData(){
	function radToDeg(radians){
		return radians * 180/Math.PI;
	}

	function enuYawToHeading(yawRad) {
		const heading = (90 - radToDeg(yawRad)) % 360;
		return (heading + 360) % 360;
	}

	let data = quat.toEuler();
	const pitch = data.pitch;
	const yaw = data.h; 
	const roll = data.g;

	text_pitch.innerText = "Pitch: "+radToDeg(pitch).toFixed(0)+"°";
	text_roll.innerText = "Roll: "+radToDeg(roll).toFixed(0)+"°";
	text_yaw.innerText = "Yaw: "+radToDeg(yaw).toFixed(0)+"°";

	text_heading.innerText = "Heading: "+enuYawToHeading(yaw).toFixed(0)+"°";

	renderNavball();
}

let updateInteral = setInterval(renderNavball, 33);

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function deliveryOptions() {
	const throttleRate = Number.parseInt(throttle.value, 10);
	return {
		throttleRate: Number.isFinite(throttleRate) && throttleRate >= 0 ? throttleRate : 0,
		queueLength: 1,
	};
}

function timestampSeconds(stamp) {
	const secs = stamp && (stamp.sec === undefined ? stamp.secs : stamp.sec);
	const nanosecs = stamp && (stamp.nanosec === undefined ? stamp.nsecs : stamp.nanosec);
	return (Number.isFinite(secs) ? secs : 0) + (Number.isFinite(nanosecs) ? nanosecs : 0) * 1e-9;
}

function disconnect() {
	if (imuSubscription !== undefined) {
		imuSubscription.unsubscribe();
		imuSubscription = undefined;
	}
}

function clearImuData() {
	text_accel_x.innerText = "X: /";
	text_accel_y.innerText = "Y: /";
	text_accel_z.innerText = "Z: /";
	text_gyro_x.innerText = "X: /";
	text_gyro_y.innerText = "Y: /";
	text_gyro_z.innerText = "Z: /";
}

function connect(){
	disconnect();
	if (sourceMode !== "imu") {
		clearImuData();
		return;
	}

	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		status.setError("Select a configured endpoint.");
		return;
	}

	tf = endpointService.getTf(configuration.adapterId);
	status.setWarn("No data received.");

	let stamp = null;
	let estimatedQuat = new Quaternion(1, 0, 0, 0);  // Identity quaternion (w, x, y, z)
	let isGyroValid = false;

	function isQuaternionValid(q) {
		const norm = Math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
		return norm > 0.5 && Math.abs(norm - 1.0) < 0.1;  // Basic sanity check
	}

	imuSubscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		text_frame_id.innerText = "Frame: "+message.frameId;

		const msg_quat = new Quaternion([
			message.orientation.w,
			message.orientation.x,
			message.orientation.y,
			message.orientation.z,
		]);

		text_quaternion.innerText = "Quaternion XYZW: "+msg_quat.x.toFixed(3)+","+msg_quat.y.toFixed(3)+","+msg_quat.z.toFixed(3)+","+msg_quat.w.toFixed(3);

		const ax = message.linearAcceleration.x;
		const ay = message.linearAcceleration.y;
		const az = message.linearAcceleration.z;

		const gx = message.angularVelocity.x;
		const gy = message.angularVelocity.y;
		const gz = message.angularVelocity.z;

		if(!isQuaternionValid(msg_quat)){
			const now = timestampSeconds(message.stamp);
			let dt = stamp ? (now - stamp) : 0.05;
			dt = Math.min(dt, 0.05);
			stamp = now;

			let gyroQuat = estimatedQuat.clone();

			if(gx != 0 || gy != 0 || gz != 0){
				const angle = Math.sqrt(gx*gx + gy*gy + gz*gz) * dt;
				if(angle > 0.0001) {
					const axis = [
						gx / angle * dt,
						gy / angle * dt,
						gz / angle * dt,
					];
					const deltaQuat = Quaternion.fromAxisAngle(axis, angle);
					gyroQuat = estimatedQuat.mul(deltaQuat).normalize();
				}
				isGyroValid = true;
			}

			if(ax != 0 || ay != 0 || az != 0){
				const accRoll = Math.atan2(ay, az);
				const accPitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));

				const rollQuat = Quaternion.fromEuler(0, accRoll, 0);
				const pitchQuat = Quaternion.fromEuler(0, 0, accPitch);
				const accelQuat = pitchQuat.mul(rollQuat).normalize();

				if(isGyroValid){
					const yawQuat = Quaternion.fromEuler(gyroQuat.toEuler().h, 0, 0);
					const fusedQuat = yawQuat.mul(accelQuat).normalize();
					const interpolator = gyroQuat.slerp(fusedQuat);

					estimatedQuat = interpolator(0.03);
					quat = estimatedQuat;
					status.setWarn("Quaternion invalid, estimating with accel and gyro.");
				}else{
					estimatedQuat = accelQuat;
					const interpolator = quat.slerp(estimatedQuat);
					quat = interpolator(0.05);
					status.setWarn("Quaternion and gyro invalid, estimating with accel only.");
				}

			} else {
				estimatedQuat = gyroQuat;
				quat = estimatedQuat;
				status.setWarn("Quaternion and accelerometer invalid, estimating with gyro only.");
			}

		} else {
			quat = msg_quat;
			status.setOK();
		}

		text_accel_x.innerText = "X: "+ ax;
		text_accel_y.innerText = "Y: "+ ay;
		text_accel_z.innerText = "Z: "+ az;

		text_gyro_x.innerText = "X: "+ gx;
		text_gyro_y.innerText = "Y: "+ gy;
		text_gyro_z.innerText = "Z: "+ gz;

		updateData();
	}, deliveryOptions());

	saveSettings();
}

function updateTfFrameList() {
	const current = tfFrame;
	tfFrameSelector.innerHTML = "<option value=''>Select TF frame</option>";
	for (const frame of tf.frame_list) {
		tfFrameSelector.innerHTML += "<option value='"+frame+"'>"+frame+"</option>";
	}
	tfFrameSelector.value = current;
	if (tfFrameSelector.value !== current && current !== "") {
		tfFrameSelector.innerHTML += "<option value='"+current+"'>"+current+"</option>";
		tfFrameSelector.value = current;
	}
}

function updateSourceUi() {
	sourceModeBox.value = sourceMode;
	endpointContainer.hidden = sourceMode !== "imu";
	tfSourceContainer.hidden = sourceMode !== "tf";
	if (sourceMode === "tf") {
		clearImuData();
		updateTfFrameList();
	}
}

endpointConfigurationEditor = createEndpointConfiguration({
	container: endpointContainer,
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

sourceModeBox.addEventListener("change", () => {
	sourceMode = sourceModeBox.value;
	updateSourceUi();
	saveSettings();
	connect();
});

tfFrameSelector.addEventListener("change", () => {
	tfFrame = tfFrameSelector.value;
	saveSettings();
	updateTfSource();
});

icon.addEventListener("click", ()=> {
	endpointConfigurationEditor.refresh();
	updateTfFrameList();
});

function updateTfSource() {
	if (sourceMode !== "tf" || tfFrame === "") {
		return;
	}
	const frame = tf.absoluteTransforms[tfFrame];
	if(!frame){
		status.setError("Required transform frame \""+tfFrame+"\" not found.");
		return;
	}

	quat = frame.rotation;
	text_frame_id.innerText = "Frame: "+tfFrame;
	text_quaternion.innerText = "Quaternion XYZW: "+quat.x.toFixed(3)+","+quat.y.toFixed(3)+","+quat.z.toFixed(3)+","+quat.w.toFixed(3);
	updateData();
	status.setOK();
}

let tf_throttle_stamp = 0;
window.addEventListener("tf_changed", ()=>{
	if(sourceMode === "tf"){
		const now = Date.now();
		if(now - tf_throttle_stamp >= deliveryOptions().throttleRate){
			updateTfSource();
			tf_throttle_stamp = now;
		}
	}
});

updateSourceUi();
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

	let canvas_width = widthSlider.value;
	let canvas_height = vwToVh(canvas_width);

	offset_x = clamp(x, canvas_width*0.3, 100 - canvas_width*0.3) ;
	offset_y = clamp(y, canvas_height*0.3, 100 - canvas_height*0.3) ;

	imgpreview.style.left = offset_x+"vw";
	imgpreview.style.top = offset_y+"vh";

	canvas.style.left = offset_x+"vw";
	canvas.style.top = offset_y+"vh";

	const new_size = Math.round((canvas_width/100.0) * window.innerWidth);

	if(canvas.width != new_size){
		canvas.style.width = new_size+"px";
		canvas.style.height = new_size+"px";
		canvas.width = new_size;
		canvas.height = new_size;
		canvasSizeChanged = true;
	}
	renderNavball();
}

window.addEventListener('resize', ()=>{
	displayImageOffset(offset_x, offset_y);
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
	
		let canvas_width = widthSlider.value/2;
		let canvas_height = vwToVh(canvas_width);
	
		offset_x = clamp(currentX/window.innerWidth * 100, canvas_width*0.3, 100 - canvas_width*0.3);
		offset_y = clamp(currentY/window.innerHeight * 100, canvas_height*0.3, 100 - canvas_height*0.3);

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

displayImageOffset(offset_x, offset_y);

console.log("Navball Widget Loaded {uniqueID}")
