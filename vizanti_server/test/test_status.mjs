import assert from 'assert';
import fs from 'fs';

let source = fs.readFileSync(new URL('../public/js/modules/status.js', import.meta.url), 'utf8');
source = source.replace('export class Status', 'class Status');
source += '\nreturn { Status };';

class ClassList {
	constructor() { this.values = new Set(); }
	add(value) { this.values.add(value); }
	remove(...values) { values.forEach(value => this.values.delete(value)); }
	contains(value) { return this.values.has(value); }
}

(async () => {
	let intervalCallback;
	let cleared = false;
	const { Status } = await new Function('setInterval', 'clearInterval', `return (async () => { ${source} })();`)(
		callback => { intervalCallback = callback; return 1; },
		() => { cleared = true; },
	);
	const icon = { isConnected: true, classList: new ClassList() };
	const message = { isConnected: true, classList: new ClassList(), innerText: '' };
	const status = new Status(icon, message);

	await status.setOK('Ready');
	intervalCallback();
	assert.equal(message.innerText, 'Status: Ready');
	assert.equal(icon.classList.contains('icon-error'), false);
	assert.equal(icon.classList.contains('icon-warn'), false);

	await status.setWarn('Warning');
	intervalCallback();
	assert.equal(message.innerText, 'Status: Warning');
	assert.equal(icon.classList.contains('icon-warn'), true);
	assert.equal(message.classList.contains('status-warn'), true);

	await status.setError('Failed');
	intervalCallback();
	assert.equal(message.innerText, 'Status: Failed');
	assert.equal(icon.classList.contains('icon-error'), true);
	assert.equal(icon.classList.contains('icon-warn'), false);
	assert.equal(message.classList.contains('status-error'), true);
	assert.equal(message.classList.contains('status-warn'), false);

	icon.isConnected = false;
	intervalCallback();
	assert.equal(cleared, true);
	console.log('status tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
