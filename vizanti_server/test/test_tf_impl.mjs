import assert from 'assert';
import fs from 'fs';

let source = fs.readFileSync(new URL('../public/js/modules/adapters/tf_ros.js', import.meta.url), 'utf8');
source = source.replace(/export function /g, 'function ');
source = source.replace('export class TFRos', 'class TFRos');
source += '\nreturn { applyRotation, TFRos };';

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
	const exports = await new Function('ROS' + 'LIB', 'Quaternion', 'window', 'performance', 'setInterval', 'Event', `return (async () => { ${source} })();`)(
		{ Topic: class {} },
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
	assert.equal(typeof exports.TFRos, 'function');
	console.log('tf tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
