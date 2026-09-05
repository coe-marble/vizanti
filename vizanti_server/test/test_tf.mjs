import assert from 'assert';
import fs from 'fs';

let source = fs.readFileSync(new URL('../public/js/modules/tf.js', import.meta.url), 'utf8');
source = source.replace("import { rosbridge } from './rosbridge.js';", 'const rosbridge = { ros: {}, compression: "none" };');
source = source.replace('export function applyRotation', 'function applyRotation');
source = source.replace('export class TF', 'class TF');
source = source.replace('export let tf = new TF();', 'const tf = null;');
source = source.replace('header.stamp?.secs', '(header.stamp && header.stamp.secs)');
source = source.replace('header.stamp?.nsecs', '(header.stamp && header.stamp.nsecs)');
source = source.replace('nearest((header.stamp && header.stamp.secs), (header.stamp && header.stamp.nsecs)) ?? this.absoluteTransforms[header.frame_id]', 'nearest((header.stamp && header.stamp.secs), (header.stamp && header.stamp.nsecs)) || this.absoluteTransforms[header.frame_id]');
source += '\nreturn { applyRotation, TF };';

class FakeQuaternion {
	constructor(w = 1, x = 0, y = 0, z = 0) {
		this.w = w;
		this.x = x;
		this.y = y;
		this.z = z;
	}

	inverse() {
		return new FakeQuaternion(this.w, -this.x, -this.y, -this.z);
	}

	rotateVector(vector) {
		return vector;
	}
}

(async () => {
	const exports = await new Function('ROS' + 'LIB', 'rosbridge', 'Quaternion', 'window', 'performance', 'setInterval', 'Event', `return (async () => { ${source} })();`)(
		{ Topic: class {} },
		{ ros: {}, compression: 'none' },
		FakeQuaternion,
		{ addEventListener() {}, dispatchEvent() {} },
		{ now() { return 100; } },
		() => 1,
		class Event { constructor(type) { this.type = type; } },
	);
	const rotated = exports.applyRotation({ x: 1, y: 2, z: 3 }, new FakeQuaternion(), false);
	assert.deepEqual(rotated, { x: 1, y: 2, z: 3 });

	const inverse = exports.applyRotation({ x: 4, y: 5, z: 6 }, new FakeQuaternion(), true);
	assert.deepEqual(inverse, { x: 4, y: 5, z: 6 });
	assert.equal(typeof exports.TF, 'function');
	console.log('tf tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
