let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let serverApiModule = await import(`${base_url}/js/modules/server_api.js`);

let settings = persistentModule.settings;
let serverApi = serverApiModule.serverApi;

const icon = document.getElementById("{uniqueID}_icon");
const panel = document.getElementById("{uniqueID}_panel");
const closeButton = document.getElementById("{uniqueID}_close");
const commandInput = document.getElementById("{uniqueID}_command");
const runButton = document.getElementById("{uniqueID}_run");
const tabButton = document.getElementById("{uniqueID}_tab");
const controlButton = document.getElementById("{uniqueID}_control");
const previousButton = document.getElementById("{uniqueID}_history_previous");
const nextButton = document.getElementById("{uniqueID}_history_next");
const statusText = document.getElementById("{uniqueID}_status");
const output = document.getElementById("{uniqueID}_output");

const sessionId = "{uniqueID}";
const maximumHistoryEntries = 100;
const maximumOutputCharacters = 50000;

let history = [];
let historyIndex = 0;
let running = false;
let lastCompletion = null;
let controlArmed = false;

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	commandInput.value = typeof loadedData.command === "string" ? loadedData.command : "";
	history = Array.isArray(loadedData.history)
		? loadedData.history.filter((entry) => typeof entry === "string").slice(-maximumHistoryEntries)
		: [];
	panel.hidden = loadedData.panel_open !== true;
}
historyIndex = history.length;

function saveSettings() {
	settings["{uniqueID}"] = {
		command: commandInput.value,
		history: history,
		panel_open: !panel.hidden,
	};
	settings.save();
}

function setStatus(message) {
	statusText.textContent = message;
}

function appendOutput(text) {
	if (text === "") {
		return;
	}

	const previous = output.textContent === "Ready." ? "" : output.textContent;
	output.textContent = (previous + text).slice(-maximumOutputCharacters);
	output.scrollTop = output.scrollHeight;
}

function openPanel() {
	panel.hidden = false;
	saveSettings();
	requestAnimationFrame(() => commandInput.focus());
}

function closePanel() {
	panel.hidden = true;
	saveSettings();
}

function togglePanel() {
	if (panel.hidden) {
		openPanel();
	} else {
		closePanel();
	}
}

function addHistory(command) {
	if (history.at(-1) !== command) {
		history.push(command);
		history = history.slice(-maximumHistoryEntries);
	}
	historyIndex = history.length;
}

function showHistory(offset) {
	if (history.length === 0) {
		return;
	}

	if (offset < 0) {
		historyIndex = Math.max(0, historyIndex - 1);
	} else {
		historyIndex = Math.min(history.length, historyIndex + 1);
	}

	commandInput.value = historyIndex === history.length ? "" : history[historyIndex];
	commandInput.focus();
	commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
	saveSettings();
}

function setRunning(value) {
	running = value;
	runButton.disabled = value;
	tabButton.disabled = value;
}

function setControlArmed(value) {
	controlArmed = value;
	controlButton.classList.toggle("active", value);
	controlButton.setAttribute("aria-pressed", String(value));
	if (value) {
		setStatus("Ctrl active. Press one letter.");
	}
}

async function sendControl(key) {
	if (!/^[a-z]$/i.test(key)) {
		setStatus("Ctrl actions use one letter.");
		return;
	}

	try {
		const result = await serverApi.sendControl({ sessionId, key });
		setStatus(result.action);
	} catch (error) {
		appendOutput(`${String(error)}\n`);
		setStatus("Ctrl action failed.");
	} finally {
		setControlArmed(false);
		commandInput.focus();
	}
}

async function runCommand() {
	const command = commandInput.value.trim();
	if (command === "" || running) {
		return;
	}

	setRunning(true);
	setStatus("Running…");
	appendOutput(`${output.textContent === "Ready." ? "" : "\n"}$ ${command}\n`);
	addHistory(command);
	commandInput.value = "";
	lastCompletion = null;
	saveSettings();

	try {
		const result = await serverApi.executeCommand({
			sessionId,
			command,
			timeoutSeconds: 30,
			background: false,
		});
		const resultOutput = [result.stdout, result.stderr]
			.filter((text) => typeof text === "string" && text !== "")
			.join("\n");
		appendOutput(resultOutput === "" ? "" : `${resultOutput}\n`);
		setStatus(result.success ? `Exit ${result.exitCode}` : `Failed: ${result.exitCode}`);
	} catch (error) {
		appendOutput(`${String(error)}\n`);
		setStatus("Command failed.");
	} finally {
		setRunning(false);
		commandInput.focus();
	}
}

async function completeCommand() {
	if (running) {
		return;
	}

	const command = commandInput.value;
	const cursor = commandInput.selectionStart;
	if (commandInput.selectionStart !== commandInput.selectionEnd) {
		setStatus("Select no text before completing.");
		return;
	}

	try {
		const result = await serverApi.completeCommand({ sessionId, command, cursor });
		const repeatedCompletion = lastCompletion
			&& lastCompletion.command === command
			&& lastCompletion.cursor === cursor;
		const canInsert = result.completion.length > result.prefix.length;

		if (canInsert) {
			commandInput.setRangeText(
				result.completion,
				result.start,
				result.cursor,
				"end"
			);
		}

		if (result.candidates.length === 0) {
			setStatus("No completion found.");
			lastCompletion = null;
			return;
		}

		if (result.candidates.length === 1) {
			setStatus("Completed.");
			lastCompletion = null;
			return;
		}

		if (repeatedCompletion && !canInsert) {
			appendOutput(`\n${result.candidates.join("  ")}\n`);
			setStatus(`${result.candidates.length} completions.`);
			lastCompletion = null;
			return;
		}

		lastCompletion = {
			command: commandInput.value,
			cursor: commandInput.selectionStart,
		};
		setStatus(`${result.candidates.length} completions. Press Tab again to list.`);
	} catch (error) {
		setStatus("Completion failed.");
		appendOutput(`${String(error)}\n`);
	}
}

icon.addEventListener("click", togglePanel);
closeButton.addEventListener("click", closePanel);
runButton.addEventListener("click", runCommand);
tabButton.addEventListener("click", completeCommand);
controlButton.addEventListener("click", () => {
	setControlArmed(!controlArmed);
	commandInput.focus();
});
previousButton.addEventListener("click", () => showHistory(-1));
nextButton.addEventListener("click", () => showHistory(1));
commandInput.addEventListener("input", () => {
	lastCompletion = null;
	saveSettings();
});
commandInput.addEventListener("keydown", (event) => {
	if (
		event.ctrlKey
		&& !event.altKey
		&& !event.metaKey
		&& /^[a-z]$/i.test(event.key)
	) {
		event.preventDefault();
		sendControl(event.key);
		return;
	}
	if (event.key === "Tab") {
		event.preventDefault();
		completeCommand();
		return;
	}
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		runCommand();
		return;
	}
	if (
		event.key === "ArrowUp"
		&& commandInput.selectionStart === 0
		&& commandInput.selectionEnd === 0
	) {
		event.preventDefault();
		showHistory(-1);
		return;
	}
	if (
		event.key === "ArrowDown"
		&& commandInput.selectionStart === commandInput.value.length
		&& commandInput.selectionEnd === commandInput.value.length
	) {
		event.preventDefault();
		showHistory(1);
	}
});
commandInput.addEventListener("beforeinput", (event) => {
	if (!controlArmed || typeof event.data !== "string" || event.data.length !== 1) {
		return;
	}

	event.preventDefault();
	sendControl(event.data);
});

console.log("Shell Widget Loaded {uniqueID}");
