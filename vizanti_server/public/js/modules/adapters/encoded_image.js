// Adapter-internal utilities for delivering encoded image payloads through
// the stable vizanti/Image contract.

import { binaryToUint8Array } from './binary.js';

export function binaryToBase64(data) {
	const bytes = binaryToUint8Array(data);
	if (typeof bytes.toBase64 === "function") {
		return bytes.toBase64();
	}

	let binary = "";
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}
