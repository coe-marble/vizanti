let viewModule = await import(`${base_url}/js/modules/view.js`);
let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let endpointEditorModule = await import(`${base_url}/js/modules/endpoint_configuration_editor.js`);
let guiMessagesModule = await import(`${base_url}/js/modules/gui_messages.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let navsatModule = await import(`${base_url}/js/modules/navsat.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let vehicleSelectionModule = await import(`${base_url}/js/modules/vehicle_selection.js`);

let view = viewModule.view;
let endpointService = endpointServiceModule.endpointService;
let createEndpointConfiguration = endpointEditorModule.createEndpointConfiguration;
let guiMessages = guiMessagesModule;
let tf = endpointService.getTf();
let settings = persistentModule.settings;
let navsat = navsatModule.navsat;
let Navsat = navsatModule.Navsat;
let Status = StatusModule.Status;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let copyright = "© OpenStreetMap";
let server_url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
let zoomLevel = 12;

let endpointConfiguration = null;
let gotoNavSatFixEndpointConfiguration = null;
let gotoPoseEndpointConfiguration = null;
let gotoMessageMode = "navsatfix";
let useManualFix = false;
let endpointConfigurationEditor;
let gotoNavSatFixEndpointConfigurationEditor;
let gotoPoseEndpointConfigurationEditor;
const navSatFixMessageType = guiMessages.GUI_MESSAGE_TYPE.NAV_SAT_FIX;
let mapSubscription = undefined;
let map_fix = undefined;
let fix_data = undefined;
let enu_origin = undefined;
let enuToScreenMat = undefined;
let last_fix_key = undefined;
let update_throttle = undefined;

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

const tileServerString = document.getElementById('{uniqueID}_tileserver');
const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');
const smoothingCheckbox = document.getElementById('{uniqueID}_smoothing');
const ignoreRotationCheckbox = document.getElementById('{uniqueID}_ignore_rotation');

const text_lat = document.getElementById("{uniqueID}_latitude");
const text_lon = document.getElementById("{uniqueID}_longitude");
const text_alt = document.getElementById("{uniqueID}_altitude");
const text_cov = document.getElementById("{uniqueID}_covariance");
const text_frame = document.getElementById("{uniqueID}_frame");
const fixedPointInput = document.getElementById("{uniqueID}_fixed_point");
const setFixedPointButton = document.getElementById("{uniqueID}_set_fixed_point");
const useManualFixBox = document.getElementById("{uniqueID}_configure_goto");
const manualFixSection = document.getElementById("{uniqueID}_manual_fix_section");
const navSatFixInputSection = document.getElementById("{uniqueID}_navsatfix_input_section");
const publishPoseStampedBox = document.getElementById("{uniqueID}_publish_pose_stamped");
const gotoEndpointHeading = document.getElementById("{uniqueID}_goto_endpoint_heading");
const gotoNavSatFixEndpointConfigurationContainer = document.getElementById("{uniqueID}_goto_navsatfix_endpoint_configuration");
const gotoPoseEndpointConfigurationContainer = document.getElementById("{uniqueID}_goto_pose_endpoint_configuration");
const contextMenu = document.getElementById("{uniqueID}_context_menu");
const mapPointer = document.getElementById("{uniqueID}_map_pointer");
const gotoPointAction = document.getElementById("{uniqueID}_goto_point_action");

contextMenu.addEventListener("mousedown", (event) => event.stopPropagation());
contextMenu.addEventListener("touchstart", (event) => event.stopPropagation());

function updateGotoPointAvailability() {
	const editor = gotoMessageMode === "pose_stamped"
		? gotoPoseEndpointConfigurationEditor : gotoNavSatFixEndpointConfigurationEditor;
	const configured = editor && editor.activeConfiguration;
	const selectedVehicle = vehicleSelectionModule.getSelectedVehicle();
	const available = configured && selectedVehicle;
	gotoPointAction.classList.toggle("menu-item-disabled", !available);
	gotoPointAction.setAttribute("aria-disabled", String(!available));
	if (!selectedVehicle) {
		gotoPointAction.title = "Select a Robot Model before sending Go To Point";
	} else if (!configured) {
		gotoPointAction.title = "Configure a Go To Point endpoint first";
	} else {
		gotoPointAction.title = "Send Go To Point to the configured endpoint";
	}
}

window.addEventListener("vehicle_selection_changed", updateGotoPointAvailability);

function updateGotoEndpointConfigurationVisibility() {
	const poseStamped = gotoMessageMode === "pose_stamped";
	publishPoseStampedBox.checked = poseStamped;
	gotoEndpointHeading.innerText = poseStamped
		? "PoseStamped Output Configuration" : "NavSatFix Output Configuration";
	gotoNavSatFixEndpointConfigurationContainer.style.display = poseStamped ? "none" : "";
	gotoPoseEndpointConfigurationContainer.style.display = poseStamped ? "" : "none";
	updateGotoPointAvailability();
}

function updateFixSourceVisibility() {
	useManualFixBox.checked = useManualFix;
	manualFixSection.style.display = useManualFix ? "" : "none";
	navSatFixInputSection.style.display = useManualFix ? "none" : "";
}

const placeholder = new Image();
placeholder.src = "assets/tile_loading.png";


function fixedPointHasValidData(input){
	return input.trim() !== "";
}


function setOpacityText(val){
	if(val == 0.0)
		opacityValue.textContent = "0.0 (Tile rendering disabled)";
	else
		opacityValue.textContent = val;

	canvas.style.opacity = parseFloat(opacitySlider.value);
}

opacitySlider.addEventListener('input', function () {
	setOpacityText(this.value);
	saveSettings();
});

smoothingCheckbox.addEventListener('change', saveSettings);
ignoreRotationCheckbox.addEventListener('change', saveSettings);

tileServerString.addEventListener('input', function () {
	server_url = this.value;

	if(server_url.includes("tile.openstreetmap.org"))
		copyright = "© OpenStreetMap";
	else
		copyright = "";

	saveSettings();
});

//dirty hack to show entire datalist when dropdown is clicked
let tileServer_prev = '';
tileServerString.addEventListener('focus', function () {
    if (this.value.trim() !== '') {
        tileServer_prev = this.value; // store for later
        this.setAttribute('placeholder', this.value);
    }
    this.value = '';
});
tileServerString.addEventListener('blur', function () {
    if (this.value.trim() === '') {
        this.value = tileServer_prev;
    }
});

let drawPending = false;
function scheduleDraw() {
    if (!drawPending) {
        drawPending = true;
        requestAnimationFrame(() => {
            drawPending = false;
            drawTiles();
        });
    }
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

// The widget framework disables clip() on this context (see below), but the
// quad renderer needs real clipping for triangle texture mapping. Grab the
// native implementation off the prototype before the override so we can call
// it explicitly, scoped inside save()/restore() so no clip state ever leaks.
const nativeClip = CanvasRenderingContext2D.prototype.clip;
ctx.clip = function(){};

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	endpointConfiguration = loaded_data.endpoint_configuration || null;
	gotoNavSatFixEndpointConfiguration = loaded_data.goto_navsatfix_endpoint_configuration || null;
	gotoPoseEndpointConfiguration = loaded_data.goto_pose_endpoint_configuration || null;
	gotoMessageMode = loaded_data.goto_message_mode === "pose_stamped" ? "pose_stamped" : "navsatfix";
	useManualFix = loaded_data.use_manual_fix === true;
	server_url = loaded_data.server_url;

	if(server_url.includes("tile.openstreetmap.org"))
		copyright = "© OpenStreetMap";
	else
		copyright = "";

	tileServerString.value = server_url;
	fixedPointInput.value = loaded_data.fixed_point;

	smoothingCheckbox.checked = loaded_data.smoothing;
	ignoreRotationCheckbox.checked = loaded_data.ignore_rotation ?? false;
	opacitySlider.value = loaded_data.opacity;
	setOpacityText(loaded_data.opacity);
}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		endpoint_configuration: endpointConfiguration,
		goto_navsatfix_endpoint_configuration: gotoNavSatFixEndpointConfiguration,
		goto_pose_endpoint_configuration: gotoPoseEndpointConfiguration,
		goto_message_mode: gotoMessageMode,
		use_manual_fix: useManualFix,
		fixed_point: fixedPointInput.value,
		server_url: server_url,
		opacity: opacitySlider.value,
		smoothing: smoothingCheckbox.checked,
		ignore_rotation: ignoreRotationCheckbox.checked,
	}
	settings.save();
}

function findParentTile(x, y, z, maxLevelsUp = 4) {
	for (let dz = 1; dz <= maxLevelsUp && (z - dz) >= 0; dz++) {
		const parentX = x >> dz;
		const parentY = y >> dz;
		const parentURL = server_url.replace("{z}", z - dz).replace("{x}", parentX).replace("{y}", parentY);
		const parentImage = navsat.live_cache[parentURL];
		if (parentImage && parentImage.complete) {
			const regionSize = navsat.tile_size >> dz; // size of our tile's region within the parent
			const srcX = (x % (1 << dz)) * regionSize;
			const srcY = (y % (1 << dz)) * regionSize;
			return { image: parentImage, srcX, srcY, srcSize: regionSize };
		}
	}
	return null;
}

// A parent tile is an effective temporary fallback while zooming in, but it
// cannot help while zooming out: the tiles already on screen are children of
// the newly requested tile. Draw available children in that case so an LOD
// transition never leaves the map blank while the lower-resolution tile is
// read from the cache or downloaded.
function findChildTiles(x, y, z, maxLevelsDown = 4) {
	for (let dz = 1; dz <= maxLevelsDown && (z + dz) <= 19; dz++) {
		const scale = 1 << dz;
		const childZoom = z + dz;
		const children = [];

		for (let childY = 0; childY < scale; childY++) {
			for (let childX = 0; childX < scale; childX++) {
				const tileX = x * scale + childX;
				const tileY = y * scale + childY;
				const maxTile = (1 << childZoom) - 1;
				const wrappedX = ((tileX % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
				const tileURL = server_url
					.replace("{z}", childZoom)
					.replace("{x}", wrappedX)
					.replace("{y}", tileY);
				const image = navsat.live_cache[tileURL];
				if (image && image.complete) {
					children.push({ image, x: tileX, y: tileY, z: childZoom });
				}
			}
		}

		if (children.length > 0) {
			return children;
		}
	}
	return [];
}

// Per-frame cache of tile corner ENU positions (corners are shared between
// neighbouring tiles, so this saves ~4x the trig). Cleared at the start of
// every drawTiles() pass, so it can never go stale w.r.t. the ENU origin.
const cornerCache = new Map();
function tileCornerEnu(x, y, z){
	const key = x + "," + y + "," + z;
	let v = cornerCache.get(key);
	if(v === undefined){
		const c = Navsat.tileToCoord(x, y, z);
		v = Navsat.llaToEnu(c.latitude, c.longitude, undefined, enu_origin); // at origin altitude

		//clear if it gets over 1MB
		if (cornerCache.size > 16384)
			cornerCache.clear();

		cornerCache.set(key, v);
	}
	return v;
}

// Texture-map one triangle of an image onto three screen points.
//
// (su, sv) are source coordinates in image pixels, p* are destination screen
// points. The affine is solved exactly so each source vertex lands exactly on
// its destination vertex; the clip confines the draw to this triangle so two
// of these calls render an arbitrary quadrilateral.
//
// The clip path is inflated by ~0.75 px outward from the triangle centroid to
// hide antialiasing hairlines along the internal diagonal and between tiles.
// The affine itself is fitted to the exact (un-inflated) corners so geometry
// stays exact; the inflated rim just shows a sliver of extrapolated texture.
function drawImageTriangle(img, su0, sv0, su1, sv1, su2, sv2, p0, p1, p2) {
	const cx = (p0.x + p1.x + p2.x) / 3;
	const cy = (p0.y + p1.y + p2.y) / 3;
	const GROW = 1.1; // px

	function inflate(p) {
		const dx = p.x - cx, dy = p.y - cy;
		const len = Math.hypot(dx, dy) || 1;
		return { x: p.x + (dx / len) * GROW, y: p.y + (dy / len) * GROW };
	}
	const q0 = inflate(p0), q1 = inflate(p1), q2 = inflate(p2);

	// Solve the affine T with T(su,sv) = p for all three vertices.
	const du1 = su1 - su0, dv1 = sv1 - sv0;
	const du2 = su2 - su0, dv2 = sv2 - sv0;
	const det = du1 * dv2 - du2 * dv1;
	if (det === 0) return;

	const a = ((p1.x - p0.x) * dv2 - (p2.x - p0.x) * dv1) / det;
	const b = ((p1.y - p0.y) * dv2 - (p2.y - p0.y) * dv1) / det;
	const c = ((p2.x - p0.x) * du1 - (p1.x - p0.x) * du2) / det;
	const d = ((p2.y - p0.y) * du1 - (p1.y - p0.y) * du2) / det;
	const e = p0.x - a * su0 - c * sv0;
	const f = p0.y - b * su0 - d * sv0;

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.beginPath();
	ctx.moveTo(q0.x, q0.y);
	ctx.lineTo(q1.x, q1.y);
	ctx.lineTo(q2.x, q2.y);
	ctx.closePath();
	nativeClip.call(ctx);
	ctx.setTransform(a, b, c, d, e, f);
	ctx.drawImage(img, 0, 0);
	ctx.restore();
}

// Draw an image (or a sub-rectangle of it) onto an arbitrary screen-space
// quadrilateral, split along the NW-SE... actually the NE-SW diagonal:
//   triangle 1: NW, NE, SW    triangle 2: NE, SE, SW
// Because all four corners are mapped exactly (no parallelogram extrapolation
// of SE), adjacent tiles share identical corner positions and identical edge
// chords, so the tile mosaic is gap-free at every zoom level by construction.
function drawImageQuad(img, sx, sy, sw, sh, pNW, pNE, pSW, pSE) {
	drawImageTriangle(img, sx, sy, sx + sw, sy, sx, sy + sh, pNW, pNE, pSW);
	drawImageTriangle(img, sx + sw, sy, sx + sw, sy + sh, sx, sy + sh, pNE, pSE, pSW);
}

function tileScreenQuad(x, y, z, inflate = true) {
	const nw = tileCornerEnu(x,     y,     z);
	const ne = tileCornerEnu(x + 1, y,     z);
	const sw = tileCornerEnu(x,     y + 1, z);
	const se = tileCornerEnu(x + 1, y + 1, z);
	const m = enuToScreenMat;
	const toScreen = (point) => ({
		x: m.a * point.x + m.b * point.y + m.e,
		y: m.c * point.x + m.d * point.y + m.f,
	});
	const corners = [toScreen(nw), toScreen(ne), toScreen(sw), toScreen(se)];

	if (!inflate) {
		return corners;
	}

	const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4;
	const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4;
	return corners.map((point) => {
		const dx = point.x - centerX;
		const dy = point.y - centerY;
		const length = Math.hypot(dx, dy) || 1;
		return { x: point.x + (dx / length) * 1.4, y: point.y + (dy / length) * 1.4 };
	});
}

function drawTileImage(image, x, y, z, sx = 0, sy = 0, sw = undefined, sh = undefined) {
	const [pNW, pNE, pSW, pSE] = tileScreenQuad(x, y, z);
	const width = sw ?? (image.naturalWidth || navsat.tile_size);
	const height = sh ?? (image.naturalHeight || navsat.tile_size);
	drawImageQuad(image, sx, sy, width, height, pNW, pNE, pSW, pSE);
}

function drawTile(i, j, tempZoomLevel, maxtile) {
	const tx = fix_data.tilePos.x + i;
	const ty = fix_data.tilePos.y + j;

	// web mercator never wraps vertically — skip out-of-range rows instead
	if (ty < 0 || ty > maxtile)
		return;

	// proper positive modulo for horizontal antimeridian wrap (any negative tx)
	const wrappedX = ((tx % (maxtile + 1)) + (maxtile + 1)) % (maxtile + 1);

	const tileURL = server_url.replace("{z}", tempZoomLevel).replace("{x}", wrappedX).replace("{y}", ty);
	let tileImage = navsat.live_cache[tileURL];
	let parentCrop = null;

	if (!tileImage || !tileImage.complete) {
		navsat.enqueue(tileURL);
		parentCrop = findParentTile(wrappedX, ty, tempZoomLevel);
		if (!parentCrop)
			tileImage = placeholder;
	}

	// Map the image onto the exact quadrilateral. The SE corner is no longer
	// extrapolated as a parallelogram (NE + SW - NW) — the tile footprint in a
	// tangent plane is a trapezoid, and that extrapolation is what produced
	// the triangular gaps between the bottom corners of adjacent tiles when
	// zoomed far out.
	if (parentCrop){
		drawTileImage(parentCrop.image, tx, ty, tempZoomLevel, parentCrop.srcX, parentCrop.srcY, parentCrop.srcSize, parentCrop.srcSize);
	}
	else {
		drawTileImage(tileImage, tx, ty, tempZoomLevel);

		if (tileImage === placeholder) {
			for (const child of findChildTiles(tx, ty, tempZoomLevel)) {
				drawTileImage(child.image, child.x, child.y, child.z);
			}
		}
	}
}

function clamp(val, from, to){
    if(val > to)
        return to;
    if(val < from)
        return from;
    return val;
}

//Rendering
async function drawTiles(){

	const wid = canvas.width;
    const hei = canvas.height;

	ctx.clearRect(0, 0, wid, hei);
	ctx.globalAlpha = 1.0;
	ctx.imageSmoothingEnabled = smoothingCheckbox.checked;

	if(!map_fix){
		return;
	}

	if(opacitySlider.value == 0.0){
		status.setOK();
		return;
	}

	let	tempZoomLevel = Math.round(Math.log2(view.scale)+17);
	tempZoomLevel = clamp(tempZoomLevel, 7, 19);
	if(tempZoomLevel != zoomLevel){
		zoomLevel = tempZoomLevel;
		updateFixData();
	}


	// ENU -> screen is one affine per frame: screen = S * (R * enu + t).
	// Build it once; per corner it's then 4 multiplies + 2 adds.
	const frame = map_fix.frame;
	const ignoreRot = ignoreRotationCheckbox.checked;
	const q = frame.rotation;
	const m00 = ignoreRot ? 1 : 1 - 2 * (q.y * q.y + q.z * q.z);
	const m01 = ignoreRot ? 0 : 2 * (q.x * q.y - q.w * q.z);
	const m10 = ignoreRot ? 0 : 2 * (q.x * q.y + q.w * q.z);
	const m11 = ignoreRot ? 1 : 1 - 2 * (q.x * q.x + q.z * q.z);
	const p0 = view.fixedToScreen({x: frame.translation.x, y: frame.translation.y});
	const s = view.scale;
	enuToScreenMat = {
		a:  s * m00, b:  s * m01, e: p0.x,
		c: -s * m10, d: -s * m11, f: p0.y
	};

	const corners = [
		{ x: 0, y: 0, z: 0 },
		{ x: wid, y: 0, z: 0 },
		{ x: wid, y: hei, z: 0  },
		{ x: 0, y: hei, z: 0  },
	];

	// Convert the corners from pixels to ENU meters in the map_fix frame,
	// then invert the exact same ENU projection used for tile placement to
	// get latitude/longitude. Because culling and drawing now use one and
	// the same (exact, invertible) mapping, they can never diverge no
	// matter how far the view moves from the origin.
	// Note: the inverse transform uses the same stamped absolute transform
	// ("frame") that transformPoseStamped uses in drawTile, so cull and
	// draw also agree on the TF sample.
	const cornerCoords = corners.map((corner) => {
		const meters = view.screenToFixed(corner);
		const d = {
			x: meters.x - frame.translation.x,
			y: meters.y - frame.translation.y,
			z: -frame.translation.z
		};

		let local;
		if(ignoreRotationCheckbox.checked){
			local = d;
		}else{
			local = tf.applyRotation(d, frame.rotation, true);
		}

		return Navsat.enuGroundToLla(local.x, local.y, enu_origin);
	});

	// Convert the corners to tile coordinates (exact mercator)
	const cornerTileCoords = cornerCoords.map((coord) =>
		Navsat.coordToTile(coord.longitude, coord.latitude, tempZoomLevel)
	);

	// Calculate the range of tiles to cover the screen
	const minX = Math.min(...cornerTileCoords.map((coord) => coord.x)) - fix_data.tilePos.x - 1;
	const maxX = Math.max(...cornerTileCoords.map((coord) => coord.x)) - fix_data.tilePos.x + 1;
	const minY = Math.min(...cornerTileCoords.map((coord) => coord.y)) - fix_data.tilePos.y - 1;
	const maxY = Math.max(...cornerTileCoords.map((coord) => coord.y)) - fix_data.tilePos.y + 1;

	//draw tiles in concentric circles, starting from the center of the screen
	const matrixWidth = (maxX - minX)+2;
	const matrixHeight = (maxY - minY)+2;
	const centerX = Math.round((maxX+minX)/2);
	const centerY = Math.round((maxY+minY)/2)-1;
	const maxtile = Math.pow(2, tempZoomLevel) - 1;

	let x = 0;
	let y = 0;
	let dx = 0;
	let dy = -1;

	const maxDimension = Math.max(matrixWidth, matrixHeight);
	for (let i = 0; i < maxDimension ** 2; i++) {
		if (-matrixWidth / 2 < x && x <= matrixWidth / 2 && -matrixHeight / 2 < y && y <= matrixHeight / 2) {
			drawTile(centerX+x, centerY+y, tempZoomLevel, maxtile);
		}
		if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
			[dx, dy] = [-dy, dx];
		}
		x += dx;
		y += dy;
	}

	//transform reset
	ctx.setTransform(1, 0, 0, 1, 0, 0);

	if(copyright != ""){
		ctx.globalAlpha = 0.6;
		ctx.fillStyle = "#171717";
		ctx.fillRect(0, hei-20, 120, 20);

		ctx.globalAlpha = 1.0;
		ctx.font = "12px Monospace";
		ctx.fillStyle = "white";
		ctx.fillText(copyright, 5, hei-5);
	}

	status.setOK();
}

const COVARIANCE_TYPE = {
	0: "(unknown)",
	1: "(approximated)",
	2: "(diagonal known)",
	3: "(known)"
}

let connect_retry = 0;

//Topic
function connect(){
	const configuration = endpointConfigurationEditor
		? endpointConfigurationEditor.activeConfiguration : null;
	if (!configuration) {
		if (!fixedPointHasValidData(fixedPointInput.value)) {
			status.setError("No NavSatFix endpoint configured.");
		}
		return;
	}

	if (mapSubscription !== undefined) {
		mapSubscription.unsubscribe();
	}

	tf = endpointService.getTf(configuration.adapterId);

	status.setWarn("No data received.");
	text_lat.innerText = "Latitude: ?";
	text_lon.innerText = "Longitude: ?";
	text_alt.innerText = "Altitude: ?";
	text_cov.innerText = "Ground Covariance: ?";
	text_frame.innerText = "TF Frame: ?";

	last_fix_key = undefined;
	update_throttle = new Date("2010-3-2");

	mapSubscription = endpointService.subscribe(configuration, navSatFixMessageType, (message) => {

		if(new Date() - update_throttle < 4000 || opacitySlider.value == 0.0) //reduces jitter and CPU load in raw receiver mode
			return;

		update_throttle = new Date();

		const cov_mat = message.positionCovariance;
		const covariance_meters = Math.hypot(Math.sqrt(cov_mat[0]), Math.sqrt(cov_mat[4]))

		text_lat.innerText = "Latitude: " + message.latitude.toFixed(8)+"°";

		text_lon.innerText = "Longitude: " + message.longitude.toFixed(8)+"°";

		text_alt.innerText = "Altitude: " + message.altitude.toFixed(2)+" m";

		text_cov.innerText = "Ground Covariance: " + covariance_meters.toFixed(2)+ " m " + COVARIANCE_TYPE[message.positionCovarianceType];

		if(message.status == -1 || Number.isNaN(message.longitude) || Number.isNaN(message.latitude)){
			status.setWarn("No fix.");
			return;
		}

		text_frame.innerText = "TF Frame: "+message.frameId;

		const frame = tf.getAbsoluteTransform({ frame_id: message.frameId, stamp: message.stamp });

		if(!frame){
			status.setError("Required transform frame \""+message.frameId+"\" not found.");
			connect_retry = (connect_retry + 1) % 5;
			if(connect_retry != 0){
				console.log("Satelite tiles connect retry...")
				setTimeout(connect, 500);
				return;
			}
			return;
		}

		connect_retry = 0;
		map_fix = { ...message, frame };

		// Only rebuild the ENU origin and tile state if the actual fix changed.
		// If it's the same position with a new header, no need to dump the corner cache and redo all the tile math.
		const cov = message.positionCovariance;
		const fix_key = `${message.latitude},${message.longitude},${message.altitude},${cov[0]},${cov[4]},${cov[8]}`;
		if(fix_key !== last_fix_key){
			last_fix_key = fix_key;
			updateFixData();
		}

		drawTiles();
	}, { throttleRate: 100, queueLength: 1 });

	saveSettings();
}

function updateFixData(){
	cornerCache.clear();

	// The ENU tangent plane is anchored at the fix coordinate. If the backend
	// projects GNSS with a fixed datum (recommended), make sure this endpoint
	// publishes that datum so both ENU frames coincide exactly.
	const alt = Number.isFinite(map_fix.altitude) ? map_fix.altitude : 0;
	enu_origin = Navsat.buildEnuOrigin(map_fix.latitude, map_fix.longitude, alt);

	fix_data = {
		tilePos: Navsat.coordToTile(map_fix.longitude, map_fix.latitude, zoomLevel)
	};
}

function handleGotoPoint(pointX, pointY) {
	const rect = canvas.getBoundingClientRect();

	// extract lat lon from screen coordinates
	const screenPos = { x: pointX - rect.left, y: pointY - rect.top };
	const enuPos = view.screenToFixed(screenPos);

	const frame = map_fix.frame;
	const d = {
		x: enuPos.x - frame.translation.x,
		y: enuPos.y - frame.translation.y,
		z: -frame.translation.z
	};

	const frameLocal = tf.applyRotation(d, frame.rotation, true);
	const displayedLocal = ignoreRotationCheckbox.checked ? d : frameLocal;
	const lla = Navsat.enuGroundToLla(displayedLocal.x, displayedLocal.y, enu_origin);
	publishGotoPoint(lla, enuPos);
}

function publishGotoPoint(lla, mapPoint) {
	const poseStamped = gotoMessageMode === "pose_stamped";
	const editor = poseStamped
		? gotoPoseEndpointConfigurationEditor : gotoNavSatFixEndpointConfigurationEditor;
	const configuration = editor ? editor.activeConfiguration : null;
	if (!configuration) {
		status.setError("No Go To Point endpoint configured.");
		return;
	}

	const now = Date.now();
	const stamp = { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1e6 };
	if (poseStamped) {
		endpointService.publish(configuration, guiMessages.createPoseStamped({
			frameId: tf.fixed_frame,
			stamp,
			position: {
				x: mapPoint.x,
				y: mapPoint.y,
				z: Number.isFinite(mapPoint.z) ? mapPoint.z : 0,
			},
			orientation: { x: 0, y: 0, z: 0, w: 1 },
		}));
	} else {
		endpointService.publish(configuration, guiMessages.createNavSatFix({
			frameId: map_fix.frameId,
			stamp,
			status: 0,
			service: 0,
			latitude: lla.latitude,
			longitude: lla.longitude,
			altitude: lla.altitude ?? 0.0,
			positionCovariance: Array(9).fill(0),
			positionCovarianceType: 0,
		}));
	}
	status.setOK();
}


window.handleContextMenuAction = function(event, action) {
	if(action == "goto_point"){
		const editor = gotoMessageMode === "pose_stamped"
			? gotoPoseEndpointConfigurationEditor : gotoNavSatFixEndpointConfigurationEditor;
		if (!vehicleSelectionModule.getSelectedVehicle() || !editor || !editor.activeConfiguration) {
			return;
		}
		let pinX = mapPointer.offsetLeft + mapPointer.width / 2;
		let pinY = mapPointer.offsetTop + mapPointer.height;
		handleGotoPoint(pinX, pinY);
	}

	contextMenu.style.display = "none";
	mapPointer.style.display = "none";

}


function initialize(){
	if (useManualFix) {
		const fixedPoint = fixedPointInput.value.trim();
		if (fixedPointHasValidData(fixedPoint)) {
			setFixedPointButton.click();
		} else {
			status.setError("Enter a manual fixed point.");
		}
	} else {
		connect();
	}
}


canvas.addEventListener("contextmenu", (event) => {
	event.preventDefault();
	event.stopPropagation();
	contextMenu.style.left = `${event.pageX+10}px`;
    contextMenu.style.top = `${event.pageY+10}px`;
	let w = mapPointer.style.width.replace("px", "");
	let h = mapPointer.style.height.replace("px", "");
	mapPointer.style.left = `${event.pageX-w/2}px`;
	mapPointer.style.top = `${event.pageY-h}px`;
    // Make the menu visible
	mapPointer.style.display = "block";
    contextMenu.style.display = "block";
	view.setInputMovementEnabled(false);
});


canvas.addEventListener("click", (event) => {
	// Hide the menu when clicking anywhere else
	contextMenu.style.display = "none";
	mapPointer.style.display = "none";
	view.setInputMovementEnabled(true);
});


setFixedPointButton.addEventListener("click", (event) => {
	const input = fixedPointInput.value.trim();

	if(!fixedPointHasValidData(input)){
		status.setError("Fixed point input is empty.");
		return;
	}

	const parts = input.split(",");
	if(parts.length != 4){
		status.setError("Fixed point input must be in the format: frame_id,latitude,longitude,altitude");
		return;
	}

	const frame_id = parts[0].trim();
	const lat = parseFloat(parts[1].trim());
	const lon = parseFloat(parts[2].trim());
	const alt = parseFloat(parts[3].trim());


	if(frame_id === "" || isNaN(lat) || isNaN(lon) || isNaN(alt)){
		status.setError("Frame, latitude, longitude, and altitude must be valid.");
		return;
	}

	text_lat.innerText = "Latitude: " + lat.toFixed(8)+"°";
	text_lon.innerText = "Longitude: " + lon.toFixed(8)+"°";
	text_alt.innerText = "Altitude: " + alt.toFixed(2)+" m";

	text_frame.innerText = "TF Frame: "+frame_id;

	// The entered geodetic fix is the ENU origin; selecting its frame makes
	// that origin the map's (0, 0) coordinate and tile-map origin.
	tf.setFixedFrame(frame_id);

	const stamp = { sec: 0, nanosec: 0 };
	let frame = tf.getAbsoluteTransform({ frame_id, stamp });
	if(!frame){
		status.setError("Required transform frame \""+frame_id+"\" not found.");
		return;
	}

	map_fix = {
		frameId: frame_id,
		stamp,
		frame: frame,
		latitude: lat,
		longitude: lon,
		altitude: alt,
		positionCovariance: [0,0,0,0,0,0,0,0,0],
		positionCovarianceType: 0
	};
	// The tile corner cache is expressed in the datum's ENU frame. Rebuild it
	// with the new datum before culling or drawing any tiles.
	updateFixData();

	// A new datum changes what map (0, 0) represents. Keep the current zoom,
	// but centre the completed map state before drawing it.
	view.center = { x: 0, y: 0 };
	settings.view.center = view.center;
	settings.save();
	view.sendUpdateEvent();
	scheduleDraw();
	status.setOK();
	saveSettings();
});

icon.addEventListener("click", (event) => {
	initialize();
});

endpointConfigurationEditor = createEndpointConfiguration({
	container: document.getElementById("{uniqueID}_endpoint_configuration"),
	endpointService,
	guiMessageType: navSatFixMessageType,
	endpointType: "topic",
	configuration: endpointConfiguration,
	onChange(configuration) {
		endpointConfiguration = configuration;
		saveSettings();
		if (!useManualFix) {
			connect();
		}
	},
});

gotoNavSatFixEndpointConfigurationEditor = createEndpointConfiguration({
	container: gotoNavSatFixEndpointConfigurationContainer,
	endpointService,
	guiMessageType: navSatFixMessageType,
	endpointType: "topic",
	configuration: gotoNavSatFixEndpointConfiguration,
	onChange(configuration) {
		gotoNavSatFixEndpointConfiguration = configuration;
		saveSettings();
		updateGotoPointAvailability();
	},
});

gotoPoseEndpointConfigurationEditor = createEndpointConfiguration({
	container: gotoPoseEndpointConfigurationContainer,
	endpointService,
	guiMessageType: guiMessages.GUI_MESSAGE_TYPE.POSE_STAMPED,
	endpointType: "topic",
	configuration: gotoPoseEndpointConfiguration,
	onChange(configuration) {
		gotoPoseEndpointConfiguration = configuration;
		saveSettings();
		updateGotoPointAvailability();
	},
});

publishPoseStampedBox.addEventListener("change", () => {
	gotoMessageMode = publishPoseStampedBox.checked ? "pose_stamped" : "navsatfix";
	updateGotoEndpointConfigurationVisibility();
	saveSettings();
});


useManualFixBox.addEventListener("change", () => {
	useManualFix = useManualFixBox.checked;
	updateFixSourceVisibility();
	saveSettings();
	if (mapSubscription !== undefined) {
		mapSubscription.unsubscribe();
		mapSubscription = undefined;
	}
	initialize();
});

await endpointConfigurationEditor.refresh();
await gotoNavSatFixEndpointConfigurationEditor.refresh();
await gotoPoseEndpointConfigurationEditor.refresh();
updateGotoEndpointConfigurationVisibility();
updateFixSourceVisibility();
initialize();


function resizeScreen(){
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	scheduleDraw();
}

window.addEventListener("navsat_tilecache_updated", scheduleDraw);
window.addEventListener("tf_fixed_frame_changed", scheduleDraw);
window.addEventListener("tf_changed", ()=>{
	if(map_fix && map_fix.frameId != tf.fixed_frame){
		scheduleDraw();
	}
});

window.addEventListener("view_changed", scheduleDraw);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

document.getElementById("{uniqueID}_export_DB").addEventListener("click", async (event) =>{

	let filename = await prompt("Enter file name for tile DB export (.json will be appended automatically):", "navsat_tile_db");
	if (filename != null) {
		navsatModule.exportDatabase(filename+'.json');
	}
});

document.getElementById("{uniqueID}_import_DB").addEventListener("click", (event) =>{

	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (event) => {
		const file = event.target.files[0];
		const reader = new FileReader();
		reader.onload = () => {
			try {
				navsatModule.importDatabase(reader.result);
			} catch (error) {
				console.error('Error importing DB file:', error);
			}
		};

		reader.readAsText(file);
	};

	input.click();
});


resizeScreen();

console.log("Satelite Widget Loaded {uniqueID}")
