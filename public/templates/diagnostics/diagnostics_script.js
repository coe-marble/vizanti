let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);

let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let imageToDataURL = utilModule.imageToDataURL;

const LOG_TYPE = "rosgraph_msgs/Log";
const DIAG_TYPE = "diagnostic_msgs/DiagnosticArray";

const LOG_LEVELS = {
	1: {name: "DEBUG", colour: "#7f8c8d", bright: "#b0bec5", icon: "default", rank: 0},
	2: {name: "INFO", colour: "#2e8b57", bright: "#58d68d", icon: "green", rank: 1},
	4: {name: "WARN", colour: "#c8891a", bright: "#f5b041", icon: "yellow", rank: 2},
	8: {name: "ERROR", colour: "#c0392b", bright: "#ec7063", icon: "red", rank: 3},
	16: {name: "FATAL", colour: "#7b1010", bright: "#ff8a80", icon: "red", rank: 4}
};

const DIAG_LEVELS = {
	0: {name: "OK", colour: "#2e8b57", bright: "#58d68d", icon: "green", rank: 0},
	3: {name: "STALE", colour: "#7f8c8d", bright: "#b0bec5", icon: "default", rank: 1},
	1: {name: "WARN", colour: "#c8891a", bright: "#f5b041", icon: "yellow", rank: 2},
	2: {name: "ERROR", colour: "#c0392b", bright: "#ec7063", icon: "red", rank: 3}
};

const DEFAULT_THROTTLE = {};
DEFAULT_THROTTLE[LOG_TYPE] = 0;
DEFAULT_THROTTLE[DIAG_TYPE] = 500;

const MAX_HISTORY = 10;
const MAX_ENTRIES = 200;
const MAX_TEXT = 600;
const REDRAW_MS = 200;

let topic = getTopic("{uniqueID}");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];

let icons = {};
icons["default"] = await imageToDataURL("assets/diagnostics.svg");
icons["red"] = await imageToDataURL("assets/diagnostics_red.svg");
icons["yellow"] = await imageToDataURL("assets/diagnostics_yellow.svg");
icons["green"] = await imageToDataURL("assets/diagnostics_green.svg");

let current_icon = "";
const selectionbox = document.getElementById("{uniqueID}_topic");
const throttle = document.getElementById("{uniqueID}_throttle");
const severitybox = document.getElementById("{uniqueID}_severity");
const pausebutton = document.getElementById("{uniqueID}_pause");
const clearbutton = document.getElementById("{uniqueID}_clear");
const summarybox = document.getElementById("{uniqueID}_summary");
const placeholder = document.getElementById("{uniqueID}_placeholder");
const listdiv = document.getElementById("{uniqueID}_list");

let opened = new Set();
let keep_saved_throttle = false;

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data = settings["{uniqueID}"];
	topic = loaded_data.topic;
	throttle.value = loaded_data.throttle;
	opened = new Set(loaded_data.opened ?? []);
	keep_saved_throttle = true;
}

let groups = new Map();
let topic_type = undefined;
let is_log = false;
let topicobj = undefined;
let listener = undefined;
let paused = false;
let run_update = true;
let timers = [];

function saveSettings(){
	settings["{uniqueID}"] = {
		topic: topic,
		throttle: throttle.value,
		opened: Array.from(opened)
	}
	settings.save();
}

function getLevelInfo(level){
	const table = is_log ? LOG_LEVELS : DIAG_LEVELS;

	if(table.hasOwnProperty(level))
		return table[level];

	return {name: "L" + level, colour: "#7f8c8d", bright: "#b0bec5", icon: "default", rank: 0};
}

function setIcon(name){
	if(current_icon == name || icons[name] === undefined)
		return;

	current_icon = name;
	icon.src = icons[name];
}

function truncate(text){
	const str = String(text);

	if(str.length <= MAX_TEXT)
		return str;

	return str.substring(0, MAX_TEXT) + "... [truncated]";
}

function clearData(){
	groups.clear();
	listdiv.innerHTML = "";
	timers = [];
	run_update = true;
}

function getGroup(key){
	let group = groups.get(key);

	if(group === undefined){
		group = {key: key, level: 0, rank: -1, count: 0, last_seen: 0, message: "", entries: new Map(), dom: undefined};
		groups.set(key, group);
	}

	return group;
}

function getEntry(group, key){
	let entry = group.entries.get(key);

	if(entry === undefined){
		entry = {key: key, level: 0, rank: 0, count: 0, last_seen: 0, value: "", history: [], dom: undefined};
		group.entries.set(key, entry);
	}

	return entry;
}

function trimEntries(group){
	while(group.entries.size > MAX_ENTRIES){
		let oldest = undefined;

		for(const entry of group.entries.values()){
			if(oldest === undefined || entry.last_seen < oldest.last_seen)
				oldest = entry;
		}

		if(oldest.dom !== undefined)
			oldest.dom.root.remove();

		group.entries.delete(oldest.key);
	}
}

function pushHistory(entry, text){
	for(let i = 0; i < entry.history.length; i++){
		if(entry.history[i].text == text){
			const item = entry.history.splice(i, 1)[0];
			item.count++;
			entry.history.push(item);
			return;
		}
	}

	entry.history.push({text: text, count: 1});

	while(entry.history.length > MAX_HISTORY)
		entry.history.shift();
}

function handleLog(msg){

	if(msg.name.includes("vizanti")){
		return;
	}

	const now = Date.now() / 1000;
	const info = getLevelInfo(msg.level);
	const group = getGroup(msg.name != "" ? msg.name : "(unnamed)");

	if(info.rank > group.rank){
		group.rank = info.rank;
		group.level = msg.level;
	}

	group.count++;
	group.last_seen = now;

	const entry = getEntry(group, `${msg.file}:${msg.function}:${msg.line}`);
	entry.level = msg.level;
	entry.rank = info.rank;
	entry.count++;
	entry.last_seen = now;

	pushHistory(entry, truncate(msg.msg));
	trimEntries(group);
}

function handleDiagnostics(msg){
	const now = Date.now() / 1000;

	if(msg.status === undefined)
		return;

	for(const st of msg.status){
		const info = getLevelInfo(st.level);
		const group = getGroup(st.name != "" ? st.name : "(unnamed)");

		group.level = st.level;
		group.rank = info.rank;
		group.count++;
		group.last_seen = now;
		group.message = st.hardware_id != "" ? `${st.message} [${st.hardware_id}]` : st.message;

		if(st.values === undefined)
			continue;

		for(const kv of st.values){
			const entry = getEntry(group, kv.key);
			entry.level = st.level;
			entry.rank = info.rank;
			entry.value = truncate(kv.value);
			entry.count++;
			entry.last_seen = now;
		}

		trimEntries(group);
	}
}

function buildGroup(group){
	const root = document.createElement("details");
	root.className = "diagnostics_group";

	const summary = document.createElement("summary");

	const badge = document.createElement("span");
	badge.className = "diagnostics_badge";

	const name = document.createElement("span");
	name.className = "diagnostics_name";

	const sub = document.createElement("span");
	sub.className = "diagnostics_sub";

	const age = document.createElement("span");
	age.className = "diagnostics_age";

	summary.appendChild(badge);
	summary.appendChild(name);
	summary.appendChild(sub);
	summary.appendChild(age);

	const body = document.createElement("div");
	body.className = "diagnostics_entries";

	root.appendChild(summary);
	root.appendChild(body);
	root.open = opened.has(group.key);

	root.addEventListener("toggle", () => {
		run_update = true;

		if(groups.size < 2)
			return;

		if(root.open == opened.has(group.key))
			return;

		if(root.open)
			opened.add(group.key);
		else
			opened.delete(group.key);

		saveSettings();
	});

	listdiv.appendChild(root);

	return {root: root, badge: badge, name: name, sub: sub, age: age, body: body};
}

function buildLine(dom){
	const root = document.createElement("div");
	root.className = "diagnostics_line";

	const gutter = document.createElement("div");
	gutter.className = "diagnostics_gutter";

	const dup = document.createElement("span");
	dup.className = "diagnostics_dup";
	gutter.appendChild(dup);

	const text = document.createElement("span");
	text.className = "diagnostics_value";

	root.appendChild(gutter);
	root.appendChild(text);
	dom.lines.appendChild(root);

	const row = {root: root, dup: dup, text: text};
	dom.rows.push(row);

	return row;
}

function buildEntry(group){
	const root = document.createElement("div");
	const dom = {root: root};

	if(is_log){
		root.className = "diagnostics_log_entry";

		dom.location = document.createElement("div");
		dom.location.className = "diagnostics_location";

		dom.lines = document.createElement("div");
		dom.rows = [];

		root.appendChild(dom.location);
		root.appendChild(dom.lines);
	}else{
		root.className = "diagnostics_entry";

		dom.key = document.createElement("span");
		dom.key.className = "diagnostics_key";

		dom.value = document.createElement("span");
		dom.value.className = "diagnostics_value";

		root.appendChild(dom.key);
		root.appendChild(dom.value);
	}

	group.dom.body.appendChild(root);

	return dom;
}

function updateEntry(entry){
	const dom = entry.dom;

	if(!is_log){
		dom.key.textContent = entry.key;
		dom.value.textContent = entry.value;
		return;
	}

	dom.location.textContent = entry.key;
	dom.location.style.color = getLevelInfo(entry.level).bright;

	for(let i = 0; i < entry.history.length; i++){
		const row = dom.rows[i] ?? buildLine(dom);
		const item = entry.history[i];

		row.dup.textContent = item.count > 1 ? item.count + "×" : "";
		row.text.textContent = item.text;
		row.root.style.display = "";
	}

	for(let i = entry.history.length; i < dom.rows.length; i++)
		dom.rows[i].root.style.display = "none";
}

function updateAges(){
	const now = Date.now() / 1000;

	for(const timer of timers)
		timer.span.textContent = (now - timer.source.last_seen).toFixed(1) + "s";
}

function compareByName(a, b){
	return a.key.localeCompare(b.key);
}

function compareByRecent(a, b){
	return (b.last_seen - a.last_seen) || a.key.localeCompare(b.key);
}

function reorder(container, list){
	for(let i = 0; i < list.length; i++){
		const node = list[i].dom.root;

		if(container.children[i] !== node)
			container.insertBefore(node, container.children[i] || null);
	}
}

function render(){
	const min_rank = parseInt(severitybox.value) || 0;
	const solo = groups.size == 1;
	const sorted = Array.from(groups.values()).sort(compareByName);

	let visible = 0;
	let total = 0;
	let worst_rank = -1;
	let worst_icon = "default";

	timers = [];

	for(const group of sorted){
		total += group.count;

		if(group.dom === undefined)
			group.dom = buildGroup(group);

		const dom = group.dom;
		const info = getLevelInfo(group.level);

		dom.badge.textContent = info.name;
		dom.badge.style.backgroundColor = info.colour;
		dom.name.textContent = group.key;
		dom.sub.textContent = group.message;
		dom.root.dataset.solo = solo;

		if(group.rank > worst_rank){
			worst_rank = group.rank;
			worst_icon = info.icon;
		}

		if(solo)
			dom.root.open = true;
		else if(dom.root.open != opened.has(group.key))
			dom.root.open = opened.has(group.key);

		const shown = group.rank >= min_rank;
		dom.root.style.display = shown ? "" : "none";

		if(!shown)
			continue;

		visible++;
		timers.push({span: dom.age, source: group});

		if(!dom.root.open)
			continue;

		const entries = Array.from(group.entries.values()).sort(is_log ? compareByRecent : compareByName);

		for(const entry of entries){
			if(entry.dom === undefined)
				entry.dom = buildEntry(group);

			const entry_shown = entry.rank >= min_rank;
			entry.dom.root.style.display = entry_shown ? "" : "none";

			if(!entry_shown)
				continue;

			updateEntry(entry);
		}

		reorder(dom.body, entries);
	}

	reorder(listdiv, sorted);

	placeholder.textContent = groups.size == 0 ? "Waiting for data..." : "Nothing matches the current severity.";
	placeholder.style.display = visible > 0 ? "none" : "";
	summarybox.textContent = `${visible} of ${groups.size} shown, ${total} updates`;

	setIcon(worst_icon);
	updateAges();
}

function loadSeverityOptions(){
	const table = is_log ? LOG_LEVELS : DIAG_LEVELS;
	const levels = Object.values(table).sort((a, b) => a.rank - b.rank);

	let list = "";
	for(const level of levels)
		list += `<option value='${level.rank}'>${level.name}</option>`;

	severitybox.innerHTML = list;
	severitybox.value = "0";
}

function setTopicType(type){
	if(type == topic_type)
		return;

	topic_type = type;
	is_log = type == LOG_TYPE;

	if(keep_saved_throttle)
		keep_saved_throttle = false;
	else if(DEFAULT_THROTTLE.hasOwnProperty(type))
		throttle.value = DEFAULT_THROTTLE[type];

	loadSeverityOptions();
	clearData();
}

function connect(){
	if(topicobj !== undefined){
		topicobj.unsubscribe(listener);
		topicobj = undefined;
	}

	if(topic == ""){
		status.setError("No supported topic selected.");
		return;
	}

	if(topic_type != LOG_TYPE && topic_type != DIAG_TYPE){
		status.setError("Unsupported message type.");
		return;
	}

	const rate = parseInt(throttle.value) || 0;

	topicobj = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: topic,
		messageType: topic_type,
		throttle_rate: rate,
		queue_length: rate > 0 ? 1 : 0
	});

	status.setWarn("No data received.");

	listener = topicobj.subscribe((msg) => {
		if(paused)
			return;

		if(is_log){
			handleLog(msg);
		}else{
			handleDiagnostics(msg);
		}

		run_update = true;
		status.setOK();
	});

	saveSettings();
}

async function getTopicType(name){
	const results = await rosbridge.get_all_topics();

	for(let i = 0; i < results.topics.length; i++){
		if(results.topics[i] == name)
			return results.types[i];
	}

	return undefined;
}

async function loadTopics(){
	const results = await rosbridge.get_all_topics();
	const supported = [];
	const types = {};

	let list = "";
	for(let i = 0; i < results.topics.length; i++){
		const type = results.types[i];

		if(type != LOG_TYPE && type != DIAG_TYPE)
			continue;

		supported.push(results.topics[i]);
		types[results.topics[i]] = type;
		list += `<option value='${results.topics[i]}'>${results.topics[i]} (${type})</option>`;
	}

	if(topic == "" && supported.length > 0)
		topic = supported[0];

	if(topic != "" && !supported.includes(topic))
		list += `<option value='${topic}'>${topic}</option>`;

	selectionbox.innerHTML = list;
	selectionbox.value = topic;

	setTopicType(types[topic]);
	connect();
}

throttle.addEventListener("input", () => {
	saveSettings();
	connect();
});

severitybox.addEventListener("change", () => {
	run_update = true;
});

pausebutton.addEventListener("click", () => {
	paused = !paused;
	pausebutton.textContent = paused ? "Resume" : "Pause";

	if(paused)
		summarybox.textContent = "Paused, incoming messages are dropped.";
	else
		render();
});

clearbutton.addEventListener("click", () => {
	clearData();
	render();
});

selectionbox.addEventListener("change", async () => {
	topic = selectionbox.value;
	clearData();
	setTopicType(await getTopicType(topic));
	connect();
	saveSettings();
});

icon.addEventListener("click", loadTopics);

const redraw = setInterval(() => {
	if(document.getElementById("{uniqueID}_modal") === null){
		clearInterval(redraw);

		if(topicobj !== undefined)
			topicobj.unsubscribe(listener);

		return;
	}

	if(paused)
		return;

	if(run_update){
		run_update = false;
		render();
	}else{
		updateAges();
	}
}, REDRAW_MS);

loadTopics();

console.log("Diagnostics Widget Loaded {uniqueID}")