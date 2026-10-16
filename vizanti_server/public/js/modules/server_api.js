function apiUrl(path) {
	return `${base_url}${path}`;
}

async function requestJson(path, options = {}) {
	const response = await fetch(apiUrl(path), options);
	const payload = await response.json();
	if (!response.ok) {
		throw new Error(typeof payload.error === "string" ? payload.error : "Server request failed.");
	}
	return payload;
}

function post(path, payload) {
	return requestJson(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
}

export const serverApi = Object.freeze({
	executeCommand(request) {
		return post("/api/shell/execute", request);
	},

	completeCommand(request) {
		return post("/api/shell/complete", request);
	},

	sendControl(request) {
		return post("/api/shell/control", request);
	},

	getNodeParameters(node) {
		return requestJson(`/api/ros2/parameters?node=${encodeURIComponent(node)}`);
	},

	setNodeParameter(node, name, value) {
		return post("/api/ros2/parameters", { node, name, value });
	},

	recordingStatus() {
		return requestJson("/api/ros2/recording");
	},

	setRecording(request) {
		return post("/api/ros2/recording", request);
	},
});
