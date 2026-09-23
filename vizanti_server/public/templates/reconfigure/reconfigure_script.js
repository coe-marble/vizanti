let endpointServiceModule = await import(`${base_url}/js/modules/endpoint_service.js`);
let adapterConfigurationEditorModule = await import(`${base_url}/js/modules/adapter_configuration_editor.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);

let endpointService = endpointServiceModule.endpointService;
let createAdapterConfigurationEditor = adapterConfigurationEditorModule.createAdapterConfigurationEditor;
let settings = persistentModule.settings;

const PARAM_TYPES = [
	"NOT_SET",		//0
	"BOOL",			//1
	"INTEGER",		//2
	"DOUBLE",		//3
	"STRING",		//4
	"BYTE_ARRAY",	//5
	"BOOL_ARRAY",	//6
	"INTEGER_ARRAY",//7
	"DOUBLE_ARRAY",	//8
	"STRING_ARRAY"	//9
]

const icon = document.getElementById("{uniqueID}_icon").getElementsByTagName('img')[0];
const nodeSelector = document.getElementById("{uniqueID}_node");
const loaderSpinner = document.getElementById("{uniqueID}_loader");
const paramBox = document.getElementById("{uniqueID}_params");
const refreshButton = document.getElementById("{uniqueID}_refresh");
const adapterConfigurationContainer = document.getElementById("{uniqueID}_adapter_configuration");

let nodeName = "";
let cached_params = {};
let adapterConfiguration = null;
let adapterConfigurationEditor;

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	adapterConfiguration = loadedData.adapter_configuration || null;
	nodeName = loadedData.node_name || "";
}

function saveSettings() {
	settings["{uniqueID}"] = {
		adapter_configuration: adapterConfiguration,
		node_name: nodeName,
	};
	settings.save();
}

async function getNodeParameters(node) {
	return endpointService.getNodeParameters(adapterConfiguration, node);
}

async function setNodeParameter(node, param, newValue) {
	return endpointService.setNodeParameter(adapterConfiguration, node, param, newValue);
}


function createParameterInput(fullname, defaultValue, type, element) {
	const name = fullname.split(".").at(-1);
	const id = "${uniqueID}_"+fullname;
	const arrowId = `${id}_arrow`;
	let inputElement;

	switch (type) {
		case "STRING":
			inputElement = `
				<label for="${id}"><i>string </i> ${name}:</label>
				<span><input id="${id}" type="text" value="${defaultValue}"><span id="${arrowId}" class="arrow" style="visibility: hidden;">➡</span></span>
				<div class="spacer"></div>`;
			break;
		case "INTEGER":
			inputElement = `
				<label for="${id}"><i>int </i> ${name}:</label>
				<span><input type="number" value="${defaultValue}" step="1" id="${id}"><span id="${arrowId}" class="arrow" style="visibility: hidden;">➡</span></span>
				<div class="spacer"></div>`;
			break;
		case "DOUBLE":
			inputElement = `
				<label for="${id}"><i>float </i>${name}:</label>
				<span><input type="number" value="${defaultValue}" step="0.001" id="${id}"><span id="${arrowId}" class="arrow" style="visibility: hidden;">➡</span></span>
				<div class="spacer"></div>`;
			break;
		case "BOOL":
			inputElement = `
				<label for="${id}"><i>bool </i>${name}:</label>
				<span><input type="checkbox" id="${id}" ${defaultValue ? "checked" : ""}><span id="${arrowId}" class="arrow" style="visibility: hidden;">➡</span></span>
				<div class="spacer"></div>`;
			break;
		default:
			console.error("Invalid parameter type:", type);
			return;
	}

	element.insertAdjacentHTML("beforeend", inputElement);

	setTimeout(()=>{
		document.getElementById(id).addEventListener("change", (event) => {
			let val;

			switch(type){
				case "STRING": val = event.target.value; break;
				case "INTEGER": val = parseInt(event.target.value); break;
				case "DOUBLE": val = parseFloat(event.target.value); break;
				case "BOOL": val = event.target.checked; break;
			}
			setNodeParameter(nodeName, fullname, val);

			const arrowElement = document.getElementById(arrowId);
			arrowElement.style.visibility = "visible";
			arrowElement.style.animation = "none";
			// Force reflow to make the new animation take effect
			arrowElement.offsetHeight;
			arrowElement.style.animation = null;

			arrowElement.addEventListener('animationend', () => {
				arrowElement.style.visibility = "hidden";
			}, {once: true});
		});
	}, 1);
}

function addParams(list, element){
	for (const name of Object.keys(list)) {
		const entry = list[name];
		if (Array.isArray(entry)) {
			const [fullname, value, type_ord] = entry;
			createParameterInput(fullname, value, PARAM_TYPES[type_ord], element);
		}else{ 
			const detailsElement = document.createElement('details');
			detailsElement.innerHTML = "<summary>"+name+"</summary>";
			element.appendChild(detailsElement);
			addParams(entry, detailsElement);
		}
	}
}

async function listParameters(){

	function buildRecursiveDict(list) {
		const result = {};
	
		list.forEach(([name, value, type_ordinal]) => {
			const parts = name.split('.'); // Split the name by dot as per apparent convention
			let current = result;
	
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (i === parts.length - 1) {
					current[part] = [name, value, type_ordinal];
				} else {
					if (!current[part]) {
						current[part] = {};
					}
					current = current[part];
				}
			}
		});
	
		return result;
	}

	if(nodeName == ""){
		return;
	}

	loaderSpinner.style.display = "block";
	paramBox.innerHTML = "";

	if(cached_params[nodeName]){
		addParams(cached_params[nodeName], paramBox);
	}
	
	const data = await getNodeParameters(nodeName);
	const grouped_data = buildRecursiveDict(data);
	paramBox.innerHTML = "";
	addParams(grouped_data, paramBox);
	cached_params[nodeName] = grouped_data;

	loaderSpinner.style.display = "none";
}

async function setNodeList(){
	let results = await endpointService.listNodes(adapterConfiguration);
	let nodelist = "";
	let value = "";
	let nodes = [];
	for (const node of results) {
		nodelist += "<option value='"+node+"'>"+node+"</option>"
		nodes.push(node);

		if(node.includes(nodeName)){
			value = nodeName;
		}
	}
	nodeSelector.innerHTML = nodelist;
	loaderSpinner.style.display = "none";

	//keep last selected if still available
	if(value == "")
		nodeName = nodeSelector.value;
	else
		nodeSelector.value = value;

	saveSettings();
	listParameters();
}

nodeSelector.addEventListener("change", (event)=>{
	nodeName = nodeSelector.value;
	saveSettings();
	listParameters();
});

refreshButton.addEventListener("click", listParameters);
icon.addEventListener("click", setNodeList);

adapterConfigurationEditor = createAdapterConfigurationEditor({
	container: adapterConfigurationContainer,
	endpointService,
	configuration: adapterConfiguration,
	onChange(configuration) {
		adapterConfiguration = configuration;
		cached_params = {};
		saveSettings();
	},
});
adapterConfigurationEditor.refresh();

console.log("Reconfigure Widget Loaded {uniqueID}");
