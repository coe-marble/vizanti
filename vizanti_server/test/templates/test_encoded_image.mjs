import assert from 'assert';
import { binaryToUint8Array } from '../../public/js/modules/adapters/binary.js';
import { binaryToBase64 } from '../../public/js/modules/adapters/encoded_image.js';

describe('encoded image adapter utilities', function () {
	it('encodes binary image payloads as base64', function () {
		assert.equal(binaryToBase64([104, 105]), 'aGk=');
	});

	it('normalizes indexed byte objects from binary transports', function () {
		assert.deepEqual([...binaryToUint8Array({ 0: 104, 1: 105 })], [104, 105]);
	});

	it('normalizes wrapped binary payloads', function () {
		assert.deepEqual([...binaryToUint8Array({ type: 'Buffer', data: [104, 105] })], [104, 105]);
	});
});
