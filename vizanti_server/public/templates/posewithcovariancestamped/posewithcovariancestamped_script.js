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
let applyRotation = endpointService.applyRotation.bind(endpointService);
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let imageToDataURL = utilModule.imageToDataURL;

let endpointConfiguration = null;
let endpointConfigurationEditor;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.POSE_WITH_COVARIANCE;
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const icon_pose = 'assets/pose.svg'//await imageToDataURL('assets/pose.svg');
const icon_pose_with_covariance = 'assets/posewithcovariancestamped.svg'//await imageToDataURL('assets/posewithcovariancestamped.svg');

let subscription = undefined;

let posemsg = undefined;
let frame = "";

const text_x = document.getElementById("{uniqueID}_live_x");
const text_y = document.getElementById("{uniqueID}_live_y");
const text_z = document.getElementById("{uniqueID}_live_z");
const text_dist = document.getElementById("{uniqueID}_live_dist");
const text_roll = document.getElementById("{uniqueID}_live_roll");
const text_pitch = document.getElementById("{uniqueID}_live_pitch");
const text_yaw = document.getElementById("{uniqueID}_live_yaw");

const rendermodebox = document.getElementById("{uniqueID}_rendermode");
const click_icon = document.getElementById("{uniqueID}_icon");
const icon = click_icon.getElementsByTagName('object')[0];

const scaleSlider = document.getElementById('{uniqueID}_scale');
const scaleSliderValue = document.getElementById('{uniqueID}_scale_value');
scaleSlider.addEventListener('change', saveSettings);
scaleSlider.addEventListener('input', function () {
	scaleSliderValue.textContent = this.value;
	saveSettings();
	drawMarkers();
});

const colourpicker = document.getElementById("{uniqueID}_colorpicker");
colourpicker.addEventListener("input", (event) =>{
	utilModule.setIconColor(icon, colourpicker.value);
	saveSettings();
	drawMarkers();
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

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;

	colourpicker.value = loaded_data.color ?? "#f74127";

	scaleSlider.value = loaded_data.scale;
	scaleSliderValue.textContent = scaleSlider.value;

	decay.value = loaded_data.decay ?? 10000;
	throttle.value = loaded_data.throttle ?? 100;

	rendermodebox.value = loaded_data.rendermode ?? "long_arrow";

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
		decay: decay.value,
		throttle: throttle.value,
		rendermode: rendermodebox.value
	}
	settings.save();
}

async function drawMarkers(){

	function drawAxes(size) {

		const length = parseFloat(scaleSlider.value);

		function getBasisPoints(basis, translation, rotation){
			let basis_x = applyRotation(basis, rotation);
			return [
				view.fixedToScreen({
					x: translation.x,
					y: translation.y,
				}), 
				view.fixedToScreen({
					x: translation.x + basis_x.x,
					y: translation.y + basis_x.y,
				})
			];
		}
	
		ctx.lineCap = 'round';
		ctx.lineWidth = size*0.1;
		ctx.strokeStyle = "#bf0009"; //red
		ctx.beginPath();
		let p = getBasisPoints(
			{x: length, y: 0, z: 0},
			posemsg.vec,
			posemsg.quat
		);
		ctx.moveTo(parseInt(p[0].x), parseInt(p[0].y));
		ctx.lineTo(parseInt(p[1].x), parseInt(p[1].y));
		ctx.stroke();
	
		ctx.strokeStyle = "#21cc1f"; //green
		ctx.beginPath();
	
		p = getBasisPoints(
			{x: 0, y: length, z: 0},
			posemsg.vec,
			posemsg.quat
		);
		ctx.moveTo(parseInt(p[0].x), parseInt(p[0].y));
		ctx.lineTo(parseInt(p[1].x), parseInt(p[1].y));
		ctx.stroke();
	
		ctx.strokeStyle = "#0249c4"; //blue
		ctx.beginPath();

		p = getBasisPoints(
			{x: 0, y: 0, z: length},
			posemsg.vec,
			posemsg.quat
		);
		ctx.moveTo(parseInt(p[0].x), parseInt(p[0].y));
		ctx.lineTo(parseInt(p[1].x), parseInt(p[1].y));
		ctx.stroke();
	
	}

	function drawCircle(size){
		ctx.fillStyle = colourpicker.value;
		ctx.beginPath();
		ctx.arc(0, 0, size/2, 0, 2 * Math.PI, false);
		ctx.fill();
	}

	function drawArrow(size){
		ctx.fillStyle = colourpicker.value;
		const height = parseInt(size*2.0);
		const width = parseInt(size*0.1*0.6)+1;
		const tip = parseInt(size*0.24)+1;
		const tipwidth = parseInt(size*0.3*0.6)+1;

		ctx.beginPath();
		ctx.moveTo(0, -width);
		ctx.lineTo(height - tip, -width);
		ctx.lineTo(height - tip, -tipwidth);
		ctx.lineTo(height, 0);
		ctx.lineTo(height - tip, tipwidth);
		ctx.lineTo(height - tip, width);
		ctx.lineTo(0, width);
		ctx.lineTo(0, -width);
		ctx.fill();
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
	
	function drawTranslationalCovariance(eigenvalues, size) {
		if (eigenvalues === undefined)
			return;
	
		const radiusX = Math.sqrt(eigenvalues.lambda1) * size;
		const radiusY = Math.sqrt(eigenvalues.lambda2) * size;
		const theta = Math.atan2(eigenvalues.eigenvector1[1], eigenvalues.eigenvector1[0]);

		ctx.fillStyle = 'rgba(204, 51, 204, 0.4)';
		ctx.rotate(theta);
		ctx.beginPath();
		ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, 2 * Math.PI);
		ctx.fill();
	}

	function drawAngularCovariance(covariance, size) {

		if(covariance === undefined)
			return;

		// Calculate the 2-sigma standard deviation 
		let angleUncertainty = 2 * Math.sqrt(covariance[35]);

		if(angleUncertainty > Math.PI*2)
			angleUncertainty = Math.PI*2;

		const halfAngleZ = angleUncertainty * 0.5;

		ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; // Yellow, semi-transparent
		drawPizza(-halfAngleZ, halfAngleZ, 0, size*2);
	}

	const unit = view.getMapUnitsInPixels(1.0);

	const wid = canvas.width;
    const hei = canvas.height;

	ctx.setTransform(1,0,0,1,0,0);
	ctx.clearRect(0, 0, wid, hei);

	if(!posemsg)
		return;

	if(decay.value > 0 && new Date() - posemsg.stamp > decay.value)
		return;

	if(frame === tf.fixed_frame){

		const screenpos = view.fixedToScreen(posemsg);
		const scale = unit*parseFloat(scaleSlider.value);

		ctx.setTransform(1,0,0,-1,screenpos.x, screenpos.y); //sx,0,0,sy,px,py
		
		drawTranslationalCovariance(posemsg.eigenvalues, unit);
		ctx.setTransform(1,0,0,-1,screenpos.x, screenpos.y);

		if(!posemsg.rotation_invalid){
			ctx.rotate(posemsg.yaw);
			drawAngularCovariance(posemsg.covariance, scale);

			if(rendermodebox.value == "long_arrow"){
				drawArrow(scale);
			}else{
				ctx.setTransform(1,0,0,1,0, 0);
				drawAxes(scale);
			}
				
		}else{
			drawCircle(scale*0.4);
		}
	}
}

function calculateEigen(covariance){
	//2x2 covariance submatrix for x and y.
	const covMatrix = [
		[covariance[0], covariance[1]],
		[covariance[6], covariance[7]]
	];

	const a = covMatrix[0][0];
	const b = covMatrix[0][1];
	const c = covMatrix[1][1];
	const trace = a + c;
	const det = a * c - b * b;
	const lambda1 = trace / 2 + Math.sqrt(trace * trace / 4 - det);
	const lambda2 = trace / 2 - Math.sqrt(trace * trace / 4 - det);

	let eigenvector1, eigenvector2;

	if (b !== 0) {
		eigenvector1 = [lambda1 - c, b];
		eigenvector2 = [lambda2 - c, b];
	} else {
		eigenvector1 = [1, 0];  // If off-diagonal is 0, the eigenvectors are aligned with the axes.
		eigenvector2 = [0, 1];
	}

	const norm1 = Math.sqrt(eigenvector1[0] * eigenvector1[0] + eigenvector1[1] * eigenvector1[1]);
	const norm2 = Math.sqrt(eigenvector2[0] * eigenvector2[0] + eigenvector2[1] * eigenvector2[1]);

	eigenvector1 = [eigenvector1[0] / norm1, eigenvector1[1] / norm1];
	eigenvector2 = [eigenvector2[0] / norm2, eigenvector2[1] / norm2];

	return {
		eigenvector1: eigenvector1,
		eigenvector2: eigenvector2,
		lambda1: lambda1,
		lambda2: lambda2
	}
}

function connect(){
	if (subscription) subscription.unsubscribe();
	subscription = undefined;
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration || !configuration.endpoint) {
		status.setError("No pose endpoint configured.");
		return;
	}
	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	const skip_covariance = configuration.endpoint.nativeMessageType === "geometry_msgs/msg/PoseStamped";
	icon.data = skip_covariance ? icon_pose : icon_pose_with_covariance;
	subscription = endpointService.subscribe(configuration, endpointMessageType, (message) => {
		const frameId = message.frameId || tf.fixed_frame;
		const hasWarning = message.frameId === "";
		
		if(!tf.absoluteTransforms[frameId]){
			status.setError(`Required transform frame "${frameId}" not found.`);
			return;
		}

		frame = tf.fixed_frame;

		let q = message.orientation;
		const rotation_invalid = q.x == 0 && q.y == 0 && q.z == 0 && q.w == 0

		if(rotation_invalid){
			status.setWarn("Received invalid rotation, defaulting to indentity quat.");
			q = new Quaternion();
		}

		const transformed = tf.transformPoseStamped(
			{ frameId, stamp: message.stamp },
			message.position,
			q
		);

		//Todo: transform covariance
		posemsg = {
			x: transformed.translation.x,
			y: transformed.translation.y,
			vec: transformed.translation,
			quat: transformed.rotation,
			yaw: transformed.rotation.toEuler().h,
			rotation_invalid: rotation_invalid,
			covariance: skip_covariance ? undefined : message.covariance,
			eigenvalues: skip_covariance ? undefined : calculateEigen(message.covariance),
			stamp: new Date()
		};

		let angles = (new Quaternion(q)).toEuler()
		text_x.innerText = "X: "+message.position.x.toFixed(2)+" m";
		text_y.innerText = "Y: "+message.position.y.toFixed(2)+" m";
		text_z.innerText = "Z: "+message.position.z.toFixed(2)+" m";
		text_dist.innerText = "Distance: "+Math.hypot(message.position.x, message.position.y, message.position.z).toFixed(2)+" m";
		text_roll.innerText = "Roll: "+(angles.g * (180/Math.PI)).toFixed(1)+"°";
		text_pitch.innerText = "Pitch: "+(angles.pitch * (180/Math.PI)).toFixed(1)+"°";
		text_yaw.innerText = "Yaw: "+(angles.h * (180/Math.PI)).toFixed(1)+"°";
	
		drawMarkers();
		
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
		posemsg = undefined;
		connect();
	},
});
endpointConfigurationEditor.refresh();

rendermodebox.addEventListener("change", (event) => {
	saveSettings();
});

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawMarkers();
}

window.addEventListener("tf_fixed_frame_changed", drawMarkers);
window.addEventListener("tf_changed", ()=>{
	if(frame != tf.fixed_frame){
		drawMarkers();
	}
});

window.addEventListener("view_changed", drawMarkers);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

resizeScreen();

console.log("Pose Widget Loaded {uniqueID}")
