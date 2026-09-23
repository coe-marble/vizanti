// Adapter-internal normalization for binary payloads received over transports
// such as rosbridge. Widgets only receive ordinary byte arrays in their GUI
// message contracts.

export function binaryToUint8Array(data) {
	if (data instanceof Uint8Array) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	if (Array.isArray(data)) {
		return Uint8Array.from(data);
	}
	if (typeof data === "string") {
		const base64 = data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data;
		const binary = atob(base64);
		return Uint8Array.from(binary, (character) => character.charCodeAt(0));
	}
	if (data && typeof data === "object") {
		for (const key of ["data", "bytes", "buffer"]) {
			if (data[key] !== undefined && data[key] !== data) {
				return binaryToUint8Array(data[key]);
			}
		}
		if (Number.isSafeInteger(data.length) && data.length >= 0) {
			const values = Array.from({ length: data.length }, (_, index) => data[index]);
			if (values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
				return Uint8Array.from(values);
			}
		}
		const values = Object.values(data);
		if (values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Uint8Array.from(values);
		}
	}
	throw new TypeError("Expected binary data as bytes, base64, or a recognized byte wrapper.");
}
