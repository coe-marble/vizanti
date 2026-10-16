let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let serverApiModule = await import(`${base_url}/js/modules/server_api.js`);

let settings = persistentModule.settings;
let serverApi = serverApiModule.serverApi;

const icon = document.getElementById("{uniqueID}_icon");
const shellName = document.getElementById("{uniqueID}_name");
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
const completions = document.getElementById("{uniqueID}_completions");

const sessionId = "{uniqueID}";
const maximumHistoryEntries = 100;
const maximumOutputCharacters = 50000;

let history = [];
let historyIndex = 0;
let running = false;
let lastCompletion = null;
let completing = false;
let queuedCompletion = false;
let controlArmed = false;
let outputCursor = 0;
let outputPollTimer = null;

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	shellName.value = typeof loadedData.name === "string" ? loadedData.name : "Shell";
	commandInput.value = typeof loadedData.command === "string" ? loadedData.command : "";
	history = Array.isArray(loadedData.history)
		? loadedData.history.filter((entry) => typeof entry === "string").slice(-maximumHistoryEntries)
		: [];
	panel.hidden = loadedData.panel_open !== true;
}
historyIndex = history.length;
if (!panel.hidden) {
	closeOtherShellPanels();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		name: shellName.value,
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

function clearCompletions() {
	completions.textContent = "";
	completions.hidden = true;
}

function showCompletions(text) {
	const cleanedText = text.replace(/\r/g, "").trim();
	completions.textContent = cleanedText;
	completions.hidden = cleanedText === "";
}

function closeOtherShellPanels() {
	let settingsChanged = false;
	for (const otherPanel of document.querySelectorAll(".shell-panel")) {
		if (otherPanel === panel || otherPanel.hidden) {
			continue;
		}

		otherPanel.hidden = true;
		const otherUniqueID = otherPanel.parentElement?.dataset.uniqueid;
		if (typeof otherUniqueID === "string" && settings[otherUniqueID]) {
			settings[otherUniqueID].panel_open = false;
			settingsChanged = true;
		}
	}
	if (settingsChanged) {
		settings.save();
	}
}

function openPanel() {
	closeOtherShellPanels();
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
		closeOtherShellPanels();
		requestAnimationFrame(() => commandInput.focus());
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

function finishCommand(result) {
	if (typeof result.stderr === "string" && result.stderr !== "") {
		appendOutput(`${result.stderr}\n`);
	}
	setStatus(result.success ? `Exit ${result.exitCode}` : `Failed: ${result.exitCode}`);
	setRunning(false);
	outputPollTimer = null;
	commandInput.focus();
}

async function pollCommandOutput() {
	try {
		const result = await serverApi.readShellOutput({ sessionId, outputCursor });
		if (Number.isInteger(result.outputCursor)) {
			outputCursor = result.outputCursor;
		}
		if (typeof result.output === "string" && result.output !== "") {
			appendOutput(result.output);
		}
		if (!result.running) {
			finishCommand(result);
			return;
		}
	} catch (error) {
		appendOutput(`${String(error)}\n`);
		setStatus("Output refresh failed.");
		setRunning(false);
		outputPollTimer = null;
		return;
	}

	outputPollTimer = window.setTimeout(pollCommandOutput, 250);
}

function startOutputPolling() {
	if (outputPollTimer === null) {
		pollCommandOutput();
	}
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
	if (command === "clear") {
		output.textContent = "";
		output.scrollTop = 0;
		clearCompletions();
		addHistory(command);
		commandInput.value = "";
		lastCompletion = null;
		setStatus("Screen cleared.");
		saveSettings();
		commandInput.focus();
		return;
	}

	setRunning(true);
	setStatus("Running — Ctrl+C stops it.");
	clearCompletions();
	appendOutput(`${output.textContent === "Ready." ? "" : "\n"}$ ${command}\n`);
	addHistory(command);
	commandInput.value = "";
	lastCompletion = null;
	saveSettings();

	try {
		const result = await serverApi.executeCommand({
			sessionId,
			command,
			timeoutSeconds: null,
			background: false,
			persistent: true,
		});
		if (result.running) {
			outputCursor = Number.isInteger(result.outputCursor) ? result.outputCursor : 0;
			startOutputPolling();
			return;
		}

		const resultOutput = [result.stdout]
			.filter((text) => typeof text === "string" && text !== "")
			.join("\n");
		appendOutput(resultOutput === "" ? "" : `${resultOutput}\n`);
		finishCommand(result);
	} catch (error) {
		appendOutput(`${String(error)}\n`);
		setStatus("Command failed.");
		setRunning(false);
		commandInput.focus();
	}
}

async function completeCommand() {
	if (running) {
		return;
	}
	if (completing) {
		queuedCompletion = true;
		return;
	}

	const command = commandInput.value;
	const cursor = commandInput.selectionStart;
	if (commandInput.selectionStart !== commandInput.selectionEnd) {
		setStatus("Select no text before completing.");
		return;
	}

	completing = true;
	try {
		const repeatedCompletion = lastCompletion
			&& lastCompletion.command === command
			&& lastCompletion.cursor === cursor;
		const tabCount = repeatedCompletion ? 2 : 1;
		const result = await serverApi.completeCommand({
			sessionId, command, cursor, tabCount,
		});
		if (typeof result.command !== "string" || !Number.isInteger(result.cursor)) {
			throw new Error("Bash returned an invalid completion.");
		}

		commandInput.value = result.command;
		const completedCursor = Math.max(0, Math.min(result.cursor, result.command.length));
		commandInput.setSelectionRange(completedCursor, completedCursor);
		if (typeof result.display === "string" && result.display.trim() !== "") {
			showCompletions(result.display);
		}
		saveSettings();

		if (tabCount === 2) {
			lastCompletion = null;
			setStatus("Bash completion choices listed.");
			return;
		}

		lastCompletion = {
			command: commandInput.value,
			cursor: commandInput.selectionStart,
		};
		setStatus("Completed. Press Tab again to list choices.");
	} catch (error) {
		setStatus("Completion failed.");
		appendOutput(`${String(error)}\n`);
	} finally {
		completing = false;
		if (queuedCompletion) {
			queuedCompletion = false;
			completeCommand();
		}
	}
}

shellName.addEventListener("input", saveSettings);
closeButton.addEventListener("click", closePanel);
runButton.addEventListener("click", runCommand);
tabButton.addEventListener("click", completeCommand);
controlButton.addEventListener("click", () => {
	setControlArmed(!controlArmed);
	commandInput.focus();
});
previousButton.addEventListener("click", () => showHistory(-1));
nextButton.addEventListener("click", () => showHistory(1));
for (const button of [runButton, tabButton, controlButton, previousButton, nextButton]) {
	button.addEventListener("pointerdown", (event) => {
		event.preventDefault();
		commandInput.focus({ preventScroll: true });
	});
}
for (const bashSurface of [output, statusText, completions]) {
	bashSurface.addEventListener("pointerdown", () => commandInput.blur());
}
for (const eventName of [
	"click", "contextmenu", "mousedown", "mousemove", "mouseup", "pointerdown", "pointermove",
	"pointerup", "touchstart", "touchmove", "touchend", "touchcancel", "wheel",
]) {
	panel.addEventListener(eventName, (event) => event.stopPropagation());
}
commandInput.addEventListener("input", () => {
	lastCompletion = null;
	clearCompletions();
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

let longPressTimer;
let isLongPress = false;

icon.addEventListener("mousedown", startLongPress);
icon.addEventListener("touchstart", startLongPress);
icon.addEventListener("mouseup", cancelLongPress);
icon.addEventListener("mouseleave", cancelLongPress);
icon.addEventListener("touchend", cancelLongPress);
icon.addEventListener("touchcancel", cancelLongPress);
icon.addEventListener("contextmenu", (event) => event.preventDefault());

icon.addEventListener("click", (event) => {
	event.stopPropagation();
	if (isLongPress) {
		isLongPress = false;
		return;
	}
	togglePanel();
});

function startLongPress() {
	isLongPress = false;
	longPressTimer = window.setTimeout(() => {
		isLongPress = true;
		openModal("{uniqueID}_modal");
		requestAnimationFrame(() => {
			shellName.focus();
			shellName.select();
		});
	}, 500);
}

function cancelLongPress() {
	window.clearTimeout(longPressTimer);
}

function refresh_icon_label() {
	return shellName.value.trim() || "Shell";
}
