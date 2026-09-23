let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let adapterConfigurationEditorModule = await import(`${base_url}/js/modules/adapter_configuration_editor.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);

let endpointService = endpointServiceModule.endpointService;
let createAdapterConfigurationEditor = adapterConfigurationEditorModule.createAdapterConfigurationEditor;
let settings = persistentModule.settings;

const savePathBox = document.getElementById("{uniqueID}_savepath");
const selectAllButton = document.getElementById('{uniqueID}_selectall');
const selectNoneButton = document.getElementById('{uniqueID}_selectnone');
const startButton = document.getElementById('{uniqueID}_toggle');

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];
const adapterConfigurationContainer = document.getElementById("{uniqueID}_adapter_configuration");

let path = "~/recording";
let topic_list = new Set();
let active = false;
let adapterConfiguration = null;
let adapterConfigurationEditor;

if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	path = typeof loaded_data.path === "string" ? loaded_data.path : path;
	topic_list = new Set(Array.isArray(loaded_data.topic_list) ? loaded_data.topic_list : []);
	adapterConfiguration = loaded_data.adapter_configuration || null;
}else{
	saveSettings();
}

savePathBox.value = path;

function saveSettings(){
	settings["{uniqueID}"] = {
		path: path,
		topic_list: Array.from(topic_list),
		adapter_configuration: adapterConfiguration,
	}
	settings.save();
}

async function getRecordingStatus() {
	try {
		const recording = await endpointService.recordingStatus(adapterConfiguration);
		setState(recording.active);
		return recording.active;
	} catch (error) {
		console.log(error);
		setState(false);
		return false;
	}
}

async function setRecording(topics, start, path) {
	return endpointService.setRecording(adapterConfiguration, {
		topics,
		start,
		path: start ? path : "",
	});
}

function setState(state){
	if(state){
		startButton.style.backgroundColor = "#e14044ff";
		startButton.style.color = "black";
		startButton.innerText = "Stop recording";
		icon.src = "assets/rosbag_active.svg";
	}else{
		startButton.style.backgroundColor = "rgb(38, 104, 31)";
		startButton.style.color = "white";
		startButton.innerText = "Start recording";
		icon.src = "assets/rosbag.svg";
	}

	active = state;
}

async function startRecording() {
	if(await confirm("Are you sure you want to start recording?")){
		const result = await setRecording(Array.from(topic_list), true, path);
		setState(result.success);
		alert(result.message)
	}
}

async function stopRecording() {
	if(await confirm("Are you sure you want to stop recording?")){
		const result = await setRecording([], false, '');
		setState(!result.success);
		alert(result.message)
	}
}

startButton.addEventListener('click', async () => {
	if(active){
		stopRecording();
	}else{
		startRecording();
	}
	saveSettings();
});

selectAllButton.addEventListener('click', async () => {
	const topics = await endpointService.discoverEndpoints({ adapterConfiguration });
	topics.forEach((topic) => topic_list.add(topic.id));
	
	updateTopics();
	saveSettings();
});

selectNoneButton.addEventListener('click', async () => {
	topic_list = new Set();	
	updateTopics();
	saveSettings();
});

savePathBox.addEventListener('input', async () => {
	path = savePathBox.value;
	saveSettings();
});

const topicsDiv = document.getElementById('{uniqueID}_topics');

async function updateTopics(){
	//recheck in case another client started a recording
	await getRecordingStatus();

	const topics = await endpointService.discoverEndpoints({ adapterConfiguration });

	topicsDiv.innerHTML = '';

	// Group topics by type
	let topicsByType = new Map();
	topics.forEach((topic) => {
		const type = topic.messageType || "Unknown";
		if (topicsByType.has(type)) {
			topicsByType.get(type).push(topic.id);
		} else {
			topicsByType.set(type, [topic.id]);
		}
	});

	// Create checkboxes for each group of topics
	topicsByType.forEach((topics, type) => {
		const brBefore = document.createElement('div');
		brBefore.className = 'spacer';
		topicsDiv.appendChild(brBefore);

		const button = document.createElement('button');
		button.textContent = type;
		button.className = 'collapsible';

		const div = document.createElement('div');
		div.className = 'content';
	   	div.style.display = 'none';  // Initially hide the content

		topics.forEach(topic => {
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = `${uniqueID}_${topic}`;
			checkbox.checked = topic_list.has(topic);
			checkbox.addEventListener('change', (event) => {
				if(checkbox.checked){
					topic_list.add(topic);
				}else{
					topic_list.delete(topic);
				}
				saveSettings();
			});

			const label = document.createElement('label');
			label.textContent = ` ${topic}`;

			const span = document.createElement('span');
			span.style.whiteSpace = "nowrap";
			span.appendChild(checkbox);
			span.appendChild(label);
			div.appendChild(span);

			const br = document.createElement('div');
			br.className = 'spacer';
			div.appendChild(br);

			if(checkbox.checked)
				div.style.display = 'block';
		});

		topicsDiv.appendChild(button);
		topicsDiv.appendChild(div);
	});

	// Add event listener to all collapsible buttons
	let coll = document.getElementsByClassName('collapsible');
	for (let i = 0; i < coll.length; i++) {
		coll[i].addEventListener('click', function() {
			this.classList.toggle('active');
			let content = this.nextElementSibling;
			if (content.style.display === 'block') {
				content.style.display = 'none';
			} else {
				content.style.display = 'block';
			}
		});
	}

	saveSettings();
}

icon.addEventListener("click", updateTopics);

adapterConfigurationEditor = createAdapterConfigurationEditor({
	container: adapterConfigurationContainer,
	endpointService,
	configuration: adapterConfiguration,
	onChange(configuration) {
		adapterConfiguration = configuration;
		saveSettings();
		updateTopics();
	},
});
adapterConfigurationEditor.refresh();

console.log("Rosbag Widget Loaded {uniqueID}")
