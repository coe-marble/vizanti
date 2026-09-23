let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let tf = endpointService.getTf();
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let settings = persistentModule.settings;
let imageToDataURL = utilModule.imageToDataURL;
let Status = StatusModule.Status;

let endpointConfiguration = null;
const endpointMessageType = guiMessages.GUI_MESSAGE_TYPE.OCCUPANCY_GRID;
let endpointConfigurationEditor;
let subscription = undefined;

let mapData = undefined;
let newMapData = undefined;
let receivedMessage = undefined;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let icons = {};
icons.map = await imageToDataURL("assets/map.svg");
icons.costmap = await imageToDataURL("assets/costmap.svg");
icons.raw = await imageToDataURL("assets/rawmap.svg");
icons.raw_transparent = await imageToDataURL("assets/rawmap_transparent_white.svg");
icons.raw_transparent_black = await imageToDataURL("assets/rawmap_transparent_black.svg");
icons.sonar = await imageToDataURL("assets/sonar.svg");

// Firefox currently has incomplete OffscreenCanvas support.
const tempCanvas = document.createElement("canvas");
const workerThread = new Worker(`${base_url}/templates/map/map_worker.js`);
const mapCanvas = document.createElement("canvas");
const offscreenCanvas = mapCanvas.transferControlToOffscreen();
workerThread.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName("img")[0];
const opacitySlider = document.getElementById("{uniqueID}_opacity");
const opacityValue = document.getElementById("{uniqueID}_opacity_value");
const colourSchemeBox = document.getElementById("{uniqueID}_colour_scheme");
const timestampCheckbox = document.getElementById("{uniqueID}_use_timestamp");
const throttle = document.getElementById("{uniqueID}_throttle");
const canvas = document.getElementById("{uniqueID}_canvas");
const ctx = canvas.getContext("2d", { colorSpace: "srgb" });

function setOpacityText(value) {
	if (value == 0.0) {
		opacityValue.textContent = "0.0 (Map rendering disabled)";
		return;
	}
	opacityValue.textContent = value;
}

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	endpointConfiguration = loadedData.endpoint_configuration || null;
	opacitySlider.value = loadedData.opacity ?? opacitySlider.value;
	setOpacityText(opacitySlider.value);
	colourSchemeBox.selectedIndex = loadedData.colour_scheme ?? 0;
	timestampCheckbox.checked = loadedData.use_timestamp ?? false;
	throttle.value = loadedData.throttle ?? 1000;
} else {
	saveSettings();
}

icon.src = icons[colourSchemeBox.value];

function saveSettings() {
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		opacity: opacitySlider.value,
		colour_scheme: colourSchemeBox.selectedIndex,
		throttle: throttle.value,
		use_timestamp: timestampCheckbox.checked,
	};
	settings.save();
}

function activeEndpointConfiguration() {
	return endpointConfigurationEditor ? endpointConfigurationEditor.activeConfiguration : null;
}

function deliveryOptions() {
	return {
		throttleRate: parseInt(throttle.value),
		queueLength: 1,
	};
}

function clearMap() {
	mapData = undefined;
	newMapData = undefined;
	receivedMessage = undefined;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
}

async function drawMap() {
	if (!mapData) {
		return;
	}

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
	if (opacitySlider.value == 0.0) {
		return;
	}

	const message = mapData.message;
	const mapWidth = view.getMapUnitsInPixels(tempCanvas.width * message.resolution);
	const mapHeight = view.getMapUnitsInPixels(tempCanvas.height * message.resolution);
	let tfPose = mapData.pose;

	if (!timestampCheckbox.checked) {
		tfPose = tf.transformPoseStamped(
			{ frameId: mapData.frameId, stamp: message.stamp },
			message.originPosition,
			message.originOrientation
		);
	}

	const position = view.fixedToScreen({
		x: tfPose.translation.x,
		y: tfPose.translation.y,
	});
	const matrix = view.quaterionToProjectionMatrix(tfPose.rotation);

	ctx.globalAlpha = opacitySlider.value;
	ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], position.x, position.y);
	ctx.scale(1.0, -1.0);
	ctx.drawImage(tempCanvas, 0, 0, mapWidth, mapHeight);
}

function queueWorkerMsg(message, frameId) {
	const pose = tf.transformPoseStamped(
		{ frameId, stamp: message.stamp },
		message.originPosition,
		message.originOrientation
	);

	newMapData = { message, frameId, pose };
	workerThread.postMessage({
		map_msg: message,
		colour_scheme: colourSchemeBox.value,
	});
}

function disconnect() {
	if (subscription !== undefined) {
		subscription.unsubscribe();
		subscription = undefined;
	}
}

function connect() {
	disconnect();
	const configuration = activeEndpointConfiguration();
	if (!configuration || !configuration.endpoint) {
		status.setError("No occupancy grid endpoint configured.");
		return;
	}

	tf = endpointService.getTf(configuration.adapterId);
	status.setWarn("No data received.");
	subscription = endpointService.subscribe(
		configuration,
		endpointMessageType,
		(message) => {
			if (message.width === 0 || message.height === 0) {
				status.setWarn("Received empty map.");
				return;
			}

			const frameId = message.frameId || tf.fixed_frame;
			if (message.frameId === "") {
				status.setWarn("Transform frame is an empty string, falling back to fixed frame. Fix your publisher ;)");
			}

			if (!tf.absoluteTransforms[frameId]) {
				if (frameId === "map") {
					status.setWarn("Map transform not available yet, using identity transform.");
					// This temporary TFRos state access will move behind the TF adapter API.
					tf.absoluteTransforms.map = {
						translation: { x: 0, y: 0, z: 0 },
						rotation: new Quaternion(),
					};
					tf.frame_list.add("map");
				} else {
					status.setError(`Required transform frame "${frameId}" not found.`);
					return;
				}
			}

			queueWorkerMsg(message, frameId);
			receivedMessage = { message, frameId };
		},
		deliveryOptions()
	);

	saveSettings();
}

workerThread.onmessage = (event) => {
	setTimeout(() => {
		const image = event.data.image;
		tempCanvas.width = image.width;
		tempCanvas.height = image.height;
		tempCanvas.getContext("2d", { colorSpace: "srgb" }).putImageData(image, 0, 0);
		mapData = newMapData;
		drawMap();
		status.setOK();
	}, 1);
};

opacitySlider.addEventListener("input", () => {
	setOpacityText(opacitySlider.value);
	saveSettings();
	drawMap();
});

colourSchemeBox.addEventListener("change", () => {
	icon.src = icons[colourSchemeBox.value];
	saveSettings();
	if (receivedMessage) {
		queueWorkerMsg(receivedMessage.message, receivedMessage.frameId);
	}
});

timestampCheckbox.addEventListener("change", () => {
	saveSettings();
	drawMap();
});

throttle.addEventListener("input", () => {
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
		clearMap();
		saveSettings();
		connect();
	},
});

icon.addEventListener("click", () => endpointConfigurationEditor.refresh());

function resizeScreen() {
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawMap();
}

window.addEventListener("tf_fixed_frame_changed", drawMap);
window.addEventListener("tf_changed", () => {
	if (receivedMessage && receivedMessage.frameId !== tf.fixed_frame) {
		drawMap();
	}
});
window.addEventListener("view_changed", drawMap);
window.addEventListener("resize", resizeScreen);
window.addEventListener("orientationchange", resizeScreen);

resizeScreen();
endpointConfigurationEditor.refresh();

console.log("Map Widget Loaded {uniqueID}");
