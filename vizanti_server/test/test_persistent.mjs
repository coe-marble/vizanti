import assert from 'assert';
import fs from 'fs';

let source = fs.readFileSync(new URL('../public/js/modules/persistent.js', import.meta.url), 'utf8');
source = source.replace(
	"const defaultConfigModule = await import(`${base_url}/default_widget_config`);\nconst default_config = defaultConfigModule.default;",
	'const default_config = injectedDefaultConfig;'
);
source = source.replace('export function ', 'function ');
source = source.replace('export class ', 'class ');
source = source.replace('export let settings = new Settings();', 'const settings = new Settings();');
source += '\nreturn { Settings, settings };';

(async () => {
	const storage = new Map();
	const localStorage = {
		hasOwnProperty(key) { return storage.has(key); },
		getItem(key) { return storage.get(key) || null; },
		setItem(key, value) { storage.set(key, String(value)); },
	};
	const setTimeoutStub = () => 1;
	const clearTimeoutStub = () => {};
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	const { Settings } = await new AsyncFunction(
		'injectedDefaultConfig', 'localStorage', 'setTimeout', 'clearTimeout', source
	)(
		JSON.stringify({ navbar: [{ type: 'grid', id: 'default_grid' }], view: { scale: 50 } }),
		localStorage,
		setTimeoutStub,
		clearTimeoutStub,
	);

	const defaults = new Settings();
	assert.deepEqual(defaults.navbar, [{ type: 'grid', id: 'default_grid' }]);
	assert.deepEqual(defaults.view, { scale: 50 });

	storage.set('settings', JSON.stringify({ custom: true, view: { scale: 25 } }));
	const stored = new Settings();
	assert.equal(stored.custom, true);
	assert.deepEqual(stored.view, { scale: 25 });

	stored.fromJSON(JSON.stringify({ custom: false, extra: 'value' }));
	assert.equal(stored.custom, false);
	assert.equal(stored.extra, 'value');
	stored.save();
	const persisted = JSON.parse(storage.get('settings'));
	assert.equal(persisted.custom, false);
	assert.equal(persisted.extra, 'value');
	assert.deepEqual(persisted.view, { scale: 25 });
	console.log('persistent settings tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
