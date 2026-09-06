// Stable message contracts exchanged between plugins and adapters. Native
// protocol message types must not be exposed to plugins.

export const GUI_MESSAGE_TYPE = Object.freeze({
	FLOAT: "vizanti/Float",
	INT64: "vizanti/Int64",
	INT32: "vizanti/Int32",
	BOOL: "vizanti/Bool",
	POSE: "vizanti/Pose",
	IMAGE: "vizanti/Image",
	PATH: "vizanti/Path",
});

export function createFloat(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError("vizanti/Float requires a finite numeric value.");
	}
	return Object.freeze({ type: GUI_MESSAGE_TYPE.FLOAT, value });
}

export function createPose({ frameId, position, orientation, stamp }) {
	if (typeof frameId !== "string" || !position || !orientation || !stamp) {
		throw new TypeError("vizanti/Pose requires frame, position, orientation, and timestamp.");
	}
	return Object.freeze({
		type: GUI_MESSAGE_TYPE.POSE,
		frameId,
		position: Object.freeze({ ...position }),
		orientation: Object.freeze({ ...orientation }),
		stamp: Object.freeze({ ...stamp }),
	});
}
