// The currently targeted vehicle for vehicle-scoped ROS interactions.
// This is intentionally session-only: it represents the operator's current
// selection, rather than a dashboard setting.
export let selectedVehicle = null;
const registeredVehicles = new Map();

function emitSelectionChanged() {
	window.dispatchEvent(new CustomEvent("vehicle_selection_changed", {
		detail: selectedVehicle,
	}));
}

export function selectVehicle(vehicle) {
	if (!vehicle || typeof vehicle.namespace !== "string") {
		throw new TypeError("A selected vehicle must provide a ROS namespace.");
	}

	selectedVehicle = Object.freeze({ ...vehicle });
	emitSelectionChanged();
}

export function clearSelectedVehicle() {
	if (selectedVehicle === null) {
		return;
	}

	selectedVehicle = null;
	emitSelectionChanged();
}

export function getSelectedVehicle() {
	return selectedVehicle;
}

export function registerVehicle(vehicle) {
	if (!vehicle || typeof vehicle.id !== "string" || typeof vehicle.namespace !== "string") {
		throw new TypeError("A registered vehicle must provide an id and ROS namespace.");
	}

	registeredVehicles.set(vehicle.id, Object.freeze({ ...vehicle }));
	window.dispatchEvent(new Event("vehicle_registry_changed"));
}

export function getRegisteredVehicles() {
	for (const id of registeredVehicles.keys()) {
		if (!document.getElementById(`${id}_icon`)) {
			registeredVehicles.delete(id);
		}
	}

	return [...registeredVehicles.values()].sort((first, second) =>
		first.name.localeCompare(second.name),
	);
}

function clearOnMapInteraction(event) {
	if (event.type === "mousedown" && event.button !== 0) {
		return;
	}

	clearSelectedVehicle();
}

const viewContainer = document.getElementById("view_container");
if (viewContainer) {
	viewContainer.addEventListener("mousedown", clearOnMapInteraction);
	viewContainer.addEventListener("touchstart", clearOnMapInteraction, { passive: true });
}
