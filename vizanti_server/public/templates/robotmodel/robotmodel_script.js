
let viewModule = await import(`${base_url}/js/modules/view.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let pathsModule = await import(`${base_url}/assets/robot_model/paths`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let adapterConfigurationEditorModule = await import(`${base_url}/js/modules/adapter_configuration_editor.js`);

let view = viewModule.view;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let paths = pathsModule.default;
let selectVehicle = vehicleSelectionModule.selectVehicle;
let registerVehicle = vehicleSelectionModule.registerVehicle;
let endpointService = endpointServiceModule.endpointService;
let tf = endpointService.getTf();
let applyRotation = endpointService.applyRotation.bind(endpointService);
let createAdapterConfigurationEditor = adapterConfigurationEditorModule.createAdapterConfigurationEditor;

let models = {};
let categorizedModels = {};
let thumbnailCache = {};
let adapterConfiguration = null;
let adapterConfigurationEditor;


// Since paths is now categorized, we need to handle it differently
Object.keys(paths).forEach(category => {
	categorizedModels[category] = [];

	paths[category].forEach(file => {
		const name = file.split('.png')[0].split("_").join(" ").trim();
		categorizedModels[category].push(name);

		if (!models[name]) {
			models[name] = new Image();
			models[name].category = category;

			if(category == "misc")
				models[name].src = `${base_url}/assets/robot_model/${file}`;
			else
				models[name].src = `${base_url}/assets/robot_model/${category}/${file}`;
		}
	});
});

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const icon = document.getElementById("{uniqueID}_icon");
const icon_img = icon.getElementsByTagName('img')[0];
const lengthSelector = document.getElementById("{uniqueID}_length");
const galleryTabs = document.getElementById("{uniqueID}_gallery_tabs");
const gallery = document.getElementById('{uniqueID}_gallery');

const offsetXSelector = document.getElementById("{uniqueID}_offset_x");
const offsetYSelector = document.getElementById("{uniqueID}_offset_y");
const offsetYawSelector = document.getElementById("{uniqueID}_offset_yaw");

const robotName = document.getElementById("{uniqueID}_name");
const adapterConfigurationContainer = document.getElementById("{uniqueID}_adapter_configuration");

const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');
opacitySlider.addEventListener('input', () =>  {
	opacityValue.textContent = opacitySlider.value;
	saveSettings();
});

offsetXSelector.addEventListener('input', saveSettings);
offsetYSelector.addEventListener('input', saveSettings);
offsetYawSelector.addEventListener('input', saveSettings);
robotName.addEventListener('input', saveSettings);
lengthSelector.addEventListener('input', () => {
	const value = parseFloat(lengthSelector.value);
	if (!Number.isNaN(value)) {
		length = value;
		saveSettings();
		drawRobot();
	}
});

let frame = find_base_frame();
let sprite = "4wd";
let length = parseFloat(lengthSelector.value) || 1;

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	frame = loaded_data.frame;
	length = parseFloat(loaded_data.length) || length;
	lengthSelector.value = length;
	robotName.value = loaded_data.robotName ?? "";
	adapterConfiguration = loaded_data.adapter_configuration ?? {
		adapterId: "ros2",
		values: {
			namespace: loaded_data.namespace ?? "",
			tfFrame: loaded_data.frame ?? frame,
		},
	};
	frame = configuredFrame();

	offsetXSelector.value = loaded_data.offset_x ?? 0.0;
	offsetYSelector.value = loaded_data.offset_y ?? 0.0;
	offsetYawSelector.value = loaded_data.offset_yaw ?? 0.0;

	opacitySlider.value = loaded_data.opacity  ?? 1.0;
	opacityValue.innerText = opacitySlider.value;
	canvas.style.opacity = opacitySlider.value;

	sprite = loaded_data.sprite.trim() ?? "4wd";
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		frame: frame,
		sprite: sprite,
		robotName: robotName.value,
		adapter_configuration: adapterConfiguration,
		opacity: opacitySlider.value,
			length: length,
		offset_x: offsetXSelector.value,
		offset_y: offsetYSelector.value,
		offset_yaw: offsetYawSelector.value,
	}
	settings.save();
	registerCurrentVehicle();

	canvas.style.opacity = opacitySlider.value;
	if (vehicleSelectionModule.getSelectedVehicle()?.id === "{uniqueID}") {
		selectCurrentVehicle();
	}
}

function configuredFrame() {
	const value = adapterConfiguration && adapterConfiguration.values
		? adapterConfiguration.values.tfFrame : "";
	return typeof value === "string" && value.trim() !== "" ? value.trim() : find_base_frame();
}

function createAdapterEditor() {
	adapterConfigurationEditor = createAdapterConfigurationEditor({
		container: adapterConfigurationContainer,
		endpointService,
		configuration: adapterConfiguration,
		onChange(configuration) {
			adapterConfiguration = configuration;
			frame = configuredFrame();
			saveSettings();
			drawRobot();
		},
	});
	adapterConfigurationEditor.refresh();
}

function find_base_frame(){
	//try base_link first
	for (const key of tf.frame_list.values()) {
		if (key.includes("base_link")) {
			return key
		}
	}

	//maybe footprint?
	for (const key of tf.frame_list.values()) {
		if (key.includes("base_footprint")) {
			return key
		}
	}

	//ok just base then...?
	for (const key of tf.frame_list.values()) {
		if (key.includes("base")) {
			return key
		}
	}

	//eh screw it
	return "base_link";
}

async function drawRobot() {

	const unit = view.getMapUnitsInPixels(1.0);
	const minimumVisiblePixels = 50;
	const renderedLength = Math.max(length, minimumVisiblePixels / unit) * unit;

    const wid = canvas.width;
    const hei = canvas.height;

	ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, wid, hei);

	const robotframe = tf.absoluteTransforms[frame];
	const modelimg = models[sprite];

	if(robotframe && modelimg){
		if (isRobotFocused) {
			const focusedCenter = {
				x: robotframe.translation.x,
				y: -robotframe.translation.y
			};

			if (view.center.x !== focusedCenter.x || view.center.y !== focusedCenter.y) {
				view.center = focusedCenter;
				settings.view.center = focusedCenter;
				view.sendUpdateEvent();
			}
		}

		const is_flipped = applyRotation({x: 0, y: 0, z: 1.0}, robotframe.rotation).z < 0;

		const pos = view.fixedToScreen({
			x: robotframe.translation.x,
			y: robotframe.translation.y
		});

		const matrix = view.quaterionToProjectionMatrix(robotframe.rotation);

		let ratio = modelimg.naturalHeight/modelimg.naturalWidth;
		ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], pos.x, pos.y); //sx,0,0,sy,px,py

		const offset_x = parseFloat(offsetXSelector.value) * unit;
		const offset_y = parseFloat(offsetYSelector.value) * unit;
		const offset_yaw = (parseFloat(offsetYawSelector.value) * (Math.PI / 180.0)) + Math.PI;

		ctx.transform(1, 0, 0, 1,  offset_x, offset_y);
		ctx.rotate(offset_yaw)

		if(is_flipped)
			ctx.filter = 'invert(1)';
		else
		ctx.filter = 'none';

		ctx.drawImage(modelimg, -renderedLength/2, -(renderedLength*ratio)/2, renderedLength, renderedLength*ratio);

		if (vehicleSelectionModule.getSelectedVehicle()?.id === "{uniqueID}") {
			ctx.filter = 'none';
			ctx.strokeStyle = '#4da3ff';
			ctx.lineWidth = 3;
			ctx.strokeRect(
				-renderedLength / 2 - 4,
				-(renderedLength * ratio) / 2 - 4,
				renderedLength + 8,
				renderedLength * ratio + 8,
			);
		}

		status.setOK();
	}else{
		if(robotframe){
			status.setError("Required robot sprite not found..?");
		}else{
			status.setError("Required transform frame \""+frame+"\" not found.");
		}
	}
}

function buildThumbnailGallery() {

	function generateThumbnail(image, size = 64) {
		const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
		const scaledWidth = image.naturalWidth * scale;
		const scaledHeight = image.naturalHeight * scale;

		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, size, size);
		ctx.drawImage(
			image,
			(size - scaledWidth) / 2, //x
			(size - scaledHeight) / 2, //y
			scaledWidth,
			scaledHeight
		);

		return canvas.toDataURL();
	}

	function selectSprite(event, modelName) {
		sprite = modelName;

		gallery.querySelectorAll('.thumbnail-item').forEach(item => {
			item.classList.remove('selected');
		});

		gallery.querySelectorAll('.thumbnail-item').forEach(item => {
			if (item.querySelector('.thumb-label').textContent === modelName) {
				item.classList.add('selected');
			}
		});

		event.currentTarget.classList.add('selected');

		saveSettings();
	}

    const activeTab = galleryTabs.querySelector('.active-tab');
    const category = activeTab.id.replace("{uniqueID}_","");

    gallery.innerHTML = '';
    if (categorizedModels[category]) {

        categorizedModels[category].sort().forEach(modelName => {
            const model = models[modelName];
            if (!model) return;

            // Generate or get cached thumbnail
            if (!thumbnailCache[modelName]) {
                thumbnailCache[modelName] = generateThumbnail(model);
            }

            // Create thumbnail element
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail-item';

            if (sprite === modelName)
				thumbDiv.classList.add('selected');

            thumbDiv.innerHTML = `
                <img src="${thumbnailCache[modelName]}" alt="${modelName}">
                <span class="thumb-label">${modelName}</span>
            `;

            thumbDiv.addEventListener('click', (event) => selectSprite(event, modelName));
            gallery.appendChild(thumbDiv);
        });
    }
}

function setActiveCategory(element){
	galleryTabs.querySelectorAll('.active-tab').forEach(item => {
		item.classList.remove('active-tab');
	});

	element.classList.add('active-tab');
	buildThumbnailGallery();
}

galleryTabs.addEventListener('click', (event) => {
	if(event.target != null && event.target.classList.contains("tablinks")){
		setActiveCategory(event.target);
		drawRobot();
	}
});

function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawRobot();
}

window.addEventListener("tf_fixed_frame_changed", drawRobot);
window.addEventListener("tf_changed", ()=>{
	if(frame != tf.fixed_frame){
		drawRobot();
	}
});

window.addEventListener("view_changed", drawRobot);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

let longPressTimer;
let isLongPress = false;
let isRobotFocused = false;
icon.addEventListener("mousedown", startLongPress);
icon.addEventListener("touchstart", startLongPress);

icon.addEventListener("mouseup", cancelLongPress);
icon.addEventListener("mouseleave", cancelLongPress);
icon.addEventListener("touchend", cancelLongPress);
icon.addEventListener("touchcancel", cancelLongPress);

icon.addEventListener("click", (event) => {
	event.stopPropagation();
	if (!isLongPress) {
		selectCurrentVehicle();
		setActive(!isRobotFocused);
	} else {
		isLongPress = false;
	}
});

function selectCurrentVehicle() {
	selectVehicle(getCurrentVehicle());
}

function registerCurrentVehicle() {
	registerVehicle(getCurrentVehicle());
}

function getCurrentVehicle() {
	const values = adapterConfiguration && adapterConfiguration.values
		? adapterConfiguration.values : {};
	return {
		id: "{uniqueID}",
		name: robotName.value.trim() || "Robot",
		adapterConfiguration: {
			adapterId: adapterConfiguration ? adapterConfiguration.adapterId : "",
			values: { ...values },
		},
		// Kept while older ROS-only plugins are migrated to adapter configurations.
		namespace: typeof values.namespace === "string" ? values.namespace : "",
		frame: frame,
	};
}

function endDrag() {
	setActive(false);
}

function addListeners() {
	view_container.addEventListener('mouseup', endDrag);
	view_container.addEventListener('touchend', endDrag);
}

function removeListeners() {
	view_container.removeEventListener('mouseup', endDrag);
	view_container.removeEventListener('touchend', endDrag);
}

function setActive(value) {
	isRobotFocused = value;

	if (isRobotFocused) {
		addListeners();
		drawRobot();
		view_container.style.cursor = "pointer";
	} else {
		removeListeners();
		drawRobot();
		view_container.style.cursor = "";
	}
}

icon.addEventListener("contextmenu", (event) => {
	event.preventDefault();
});


function updateVehicleSelection(event) {
	const isSelected = event.detail?.id === "{uniqueID}";
	icon.classList.toggle("vehicle-selected", isSelected);
	icon.style.backgroundColor = isSelected
		? "rgba(255, 255, 255, 1.0)"
		: "rgba(124, 124, 124, 0.3)";
	icon.title = isSelected
		? `Selected vehicle: ${event.detail.name}`
		: "Select vehicle";
	drawRobot();
}

window.addEventListener("vehicle_selection_changed", updateVehicleSelection);
updateVehicleSelection({ detail: vehicleSelectionModule.getSelectedVehicle() });
registerCurrentVehicle();

function selectRobotOnMap(event) {
	if (event.type === "mousedown" && event.button !== 0) {
		return;
	}

	const pointer = event.touches ? event.touches[0] : event;
	const robotFrame = tf.absoluteTransforms[frame];
	const modelImage = models[sprite];
	if (!pointer || !robotFrame || !modelImage) {
		return;
	}

	const unit = view.getMapUnitsInPixels(1.0);
	const renderedLength = Math.max(length, 50 / unit) * unit;
	const imageRatio = modelImage.naturalHeight / modelImage.naturalWidth;
	const robotPosition = view.fixedToScreen({
		x: robotFrame.translation.x,
		y: robotFrame.translation.y,
	});
	const hitRadius = Math.max(renderedLength, renderedLength * imageRatio) / 2 + 8;
	const distance = Math.hypot(
		pointer.clientX - robotPosition.x,
		pointer.clientY - robotPosition.y,
	);

	if (distance <= hitRadius) {
		selectCurrentVehicle();
	}
}

view_container.addEventListener("mousedown", selectRobotOnMap);
view_container.addEventListener("touchstart", selectRobotOnMap, { passive: true });


function startLongPress(event) {
	isLongPress = false;
	longPressTimer = setTimeout(() => {
		isLongPress = true;
		openModal("{uniqueID}_modal");
	}, 500);
}

function cancelLongPress(event) {
	clearTimeout(longPressTimer);
}


function refresh_icon_label(uniqueID, icon) {
	return robotName.value || "Robot";
}

resizeScreen();
createAdapterEditor();

console.log("Model Widget Loaded {uniqueID}")
