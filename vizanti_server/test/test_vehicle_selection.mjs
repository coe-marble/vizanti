import assert from 'assert';
const listeners = new Map();
const icons = new Set();

globalThis.window = {
	dispatchEvent(event) {
		for (const listener of listeners.get(event.type) || []) listener(event);
	},
	addEventListener(type, listener) {
		const callbacks = listeners.get(type) || [];
		callbacks.push(listener);
		listeners.set(type, callbacks);
	},
};
globalThis.CustomEvent = class CustomEvent {
	constructor(type, init = {}) {
		this.type = type;
		this.detail = init.detail;
	}
};
globalThis.Event = class Event {
	constructor(type) {
		this.type = type;
	}
};
globalThis.document = {
	getElementById(id) {
		return icons.has(id) ? { id } : null;
	},
};

(async () => {
	const constModule = await import('../public/js/modules/vehicle_selection.js');
	const {
		clearSelectedVehicle,
		getRegisteredVehicles,
		getSelectedVehicle,
		registerVehicle,
		selectVehicle,
	} = constModule;

	icons.add('vehicle_b_icon');
	icons.add('vehicle_a_icon');
	icons.add('vehicle_a_imc_icon');
	registerVehicle({ id: 'vehicle_b', name: 'Bravo', namespace: '/b' });
	registerVehicle({ id: 'vehicle_a', name: 'Alpha', namespace: '/a' });
	assert.deepEqual(getRegisteredVehicles().map(vehicle => vehicle.id), ['vehicle_a', 'vehicle_b']);

	registerVehicle({ id: 'vehicle_a_imc', name: 'Alpha IMC', namespace: '/a', protocol: 'imc', connectionId: 'auv_01_imc' });
	assert.deepEqual(getRegisteredVehicles().map(vehicle => vehicle.id), ['vehicle_a', 'vehicle_a_imc', 'vehicle_b']);

	let selection;
	window.addEventListener('vehicle_selection_changed', event => {
		selection = event.detail;
	});
	const vehicle = { id: 'vehicle_a', name: 'Alpha', namespace: '/a' };
	selectVehicle(vehicle);
	assert.deepEqual(getSelectedVehicle(), vehicle);
	assert.deepEqual(selection, vehicle);
	assert.throws(() => { getSelectedVehicle().namespace = '/changed'; }, TypeError);

	selectVehicle({ id: 'vehicle_a_imc', name: 'Alpha IMC', namespace: '/a', protocol: 'imc', connectionId: 'auv_01_imc' });
	assert.equal(getSelectedVehicle().connectionId, 'auv_01_imc');

	clearSelectedVehicle();
	assert.equal(getSelectedVehicle(), null);
	assert.throws(() => registerVehicle({ id: 'vehicle_c', name: 'Charlie' }), TypeError);
	assert.throws(() => selectVehicle({ id: 'vehicle_c', name: 'Charlie' }), TypeError);
	console.log('vehicle selection tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
