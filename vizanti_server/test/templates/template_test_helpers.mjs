import assert from 'assert';
import fs from 'fs';
import { fileURLToPath } from 'url';

const templateRoot = fileURLToPath(new URL('../../public/templates/', import.meta.url));

const behaviorContracts = {
	add: [],
	altimeter: ['std_msgs/msg/Float32'],
	area: ['geometry_msgs/msg/PolygonStamped'],
	battery: ['sensor_msgs/msg/BatteryState'],
	btmanager: ['/bt/files', '/bt/github/pull'],
	button: ['std_srvs/srv/Trigger', 'std_srvs/srv/SetBool'],
	compressedimage: ['sensor_msgs/msg/CompressedImage'],
	folder: ['folder'],
	grid: ['grid_frame', 'tf.fixed_frame'],
	gridcells: ['nav_msgs/msg/GridCells'],
	initialpose: ['geometry_msgs/msg/PoseWithCovarianceStamped'],
	inspector: ['new ROSLIB.Topic', 'topic_type'],
	map: ['nav_msgs/msg/OccupancyGrid'],
	markerarray: ['visualization_msgs/msg/MarkerArray'],
	navball: ['sensor_msgs/msg/Imu'],
	nodemgr: ['vizanti_msgs/srv/ListLifecycles', 'vizanti_msgs/srv/ListExecutables'],
	odom: ['nav_msgs/msg/Odometry'],
	path: ['nav_msgs/msg/Path'],
	pointcloud: ['sensor_msgs/msg/PointCloud2'],
	posearray: ['typedict[topic]'],
	posewithcovariancestamped: ['typedict[topic]'],
	range: ['sensor_msgs/msg/Range'],
	reconfigure: ['vizanti_msgs/srv/GetNodeParameters', 'vizanti_msgs/srv/SetNodeParameter'],
	robotmodel: ['find_base_frame', 'registerVehicle'],
	rosbag: ['vizanti_msgs/srv/RecordRosbag'],
	rosbridge: ['rosbridge.status', 'rosbridge_change'],
	satelite: ['sensor_msgs/msg/NavSatFix', 'Select a vehicle'],
	scan: ['sensor_msgs/msg/LaserScan'],
	settings: ['fixed_frame', 'settings.save'],
	simplegoal: ['geometry_msgs/msg/PoseStamped', 'Select a vehicle'],
	speedometer: ['base_link_frame', 'tf.absoluteTransforms'],
	survey: ['nav_msgs/msg/Path', 'Select a vehicle'],
	teleop: ['typedict[topic]', '/cmd_vel'],
	temperature: ['sensor_msgs/msg/Temperature'],
	tf: ['TF', 'tf_changed'],
	waypoints: ['nav_msgs/msg/Path', 'Select a vehicle'],
};

const interactionEventPattern = /addEventListener\(\s*["']([^"']+)["']/g;

// Legacy scripts can retain references to host-created or obsolete controls.
// Keep these exceptions explicit so redesign work cannot introduce new ones.
const undeclaredTemplateElements = {
	folder: new Set(['{uniqueID}_status']),
	map: new Set(['{uniqueID}_loadpath', '{uniqueID}_loadtopic', '{uniqueID}_savepath']),
	rosbag: new Set(['{uniqueID}_topic']),
	waypoints: new Set(['{uniqueID}_start', '{uniqueID}_stop']),
};

export function runTemplateInteractionContract(plugin) {
	const path = `${templateRoot}${plugin}/${plugin}_script.js`;
	const source = fs.readFileSync(path, 'utf8');
	const events = [...source.matchAll(interactionEventPattern)].map(match => match[1]);

	assert.ok(events.length > 0, `${plugin}: no user interaction handlers registered`);
	assert.ok(
		events.some(event => ['click', 'mousedown', 'touchstart', 'pointerdown', 'input', 'change'].includes(event)),
		`${plugin}: no click, pointer, input, or selection interaction registered`
	);

	if (source.includes('function startLongPress')) {
		assert.ok(source.includes('function cancelLongPress'), `${plugin}: long press has no cancellation handler`);
		assert.ok(source.includes('setTimeout'), `${plugin}: long press has no scheduled trigger`);
		assert.ok(source.includes('}, 500)'), `${plugin}: long press must retain its 500 ms threshold`);
		for (const event of ['mousedown', 'touchstart', 'mouseup', 'touchend', 'touchcancel']) {
			assert.ok(events.includes(event), `${plugin}: long press does not handle ${event}`);
		}
	}
}

export function runTemplateDomContract(plugin) {
	const pluginRoot = `${templateRoot}${plugin}/`;
	const script = fs.readFileSync(`${pluginRoot}${plugin}_script.js`, 'utf8');
	const html = ['icon', 'modal', 'view']
		.map(type => `${pluginRoot}${plugin}_${type}.html`)
		.filter(path => fs.existsSync(path))
		.map(path => fs.readFileSync(path, 'utf8'))
		.join('\n');
	const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
	const scriptIds = [...script.matchAll(/document\.getElementById\(["'](\{uniqueID\}_[^"']+)["']\)/g)]
		.map(match => match[1]);
	const exceptions = undeclaredTemplateElements[plugin] || new Set();

	for (const id of scriptIds) {
		assert.ok(
			htmlIds.has(id) || exceptions.has(id),
			`${plugin}: script references missing template element #${id}`
		);
	}
}

export function runTemplatePersistenceContract(plugin) {
	const script = fs.readFileSync(`${templateRoot}${plugin}/${plugin}_script.js`, 'utf8');
	if (!/function saveSettings\s*\(/.test(script)) return;

	assert.ok(
		/settings\[(?:"\{uniqueID\}"|'\{uniqueID\}')\]\s*=/.test(script),
		`${plugin}: saveSettings does not preserve a widget-scoped settings object`
	);
	assert.ok(/settings\.save\(\)/.test(script), `${plugin}: saveSettings does not persist changes`);
}

export function runTemplateContract(plugin) {
	const pluginRoot = `${templateRoot}${plugin}/`;
	const requiredFiles = [`${plugin}_icon.html`, `${plugin}_script.js`];
	const optionalFiles = [`${plugin}_modal.html`, `${plugin}_view.html`];

	for (const filename of requiredFiles) {
		const path = `${pluginRoot}${filename}`;
		assert.equal(fs.existsSync(path), true, `${plugin}: missing ${filename}`);
		const content = fs.readFileSync(path, 'utf8');
		assert.ok(content.trim().length > 0, `${plugin}: empty ${filename}`);
		if (filename.endsWith('_script.js') && plugin !== 'add') {
			assert.ok(content.includes('{uniqueID}'), `${plugin}: ${filename} lacks uniqueID substitution`);
		}
	}

	for (const filename of optionalFiles) {
		const path = `${pluginRoot}${filename}`;
		if (!fs.existsSync(path)) continue;
		const content = fs.readFileSync(path, 'utf8');
		assert.ok(content.trim().length > 0, `${plugin}: empty ${filename}`);
		if (plugin !== 'add') {
			assert.ok(content.includes('{uniqueID}'), `${plugin}: ${filename} lacks uniqueID substitution`);
		}
	}

	const script = fs.readFileSync(`${pluginRoot}${plugin}_script.js`, 'utf8');
	for (const fragment of behaviorContracts[plugin] || []) {
		assert.ok(script.includes(fragment), `${plugin}: missing behavior contract ${fragment}`);
	}

	console.log(`${plugin} template contract passed`);
}
