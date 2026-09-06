const defaultConfigModule = await import(`${base_url}/default_widget_config`);
const default_config = defaultConfigModule.default;

export function saveJsonToFile(data, filename) {
	const jsonData = JSON.stringify(data, null, 2);
	const blob = new Blob([jsonData], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
  
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
  
	URL.revokeObjectURL(url);
}

export class Settings {

	constructor() {
		if (localStorage.hasOwnProperty("settings")) {
			this.fromJSON(localStorage.getItem("settings"));
		} else {
			this.fromJSON(default_config);
		}

		Object.defineProperties(this, {
			_saveTimeout: { value: null, writable: true, enumerable: false },
			_savePending: { value: false, writable: true, enumerable: false },
		});

		if (typeof window !== "undefined") {
			window.addEventListener("pagehide", () => this.flush());
		}
	}

	fromJSON(settings_object) {
		let storedSettings = JSON.parse(settings_object);
		Object.assign(this, storedSettings);
	}

	save() {
		if (!this._saveTimeout) {
			localStorage.setItem("settings", JSON.stringify(this));
			this._saveTimeout = setTimeout(() => {
				this._saveTimeout = null;

				if (this._savePending) {
					this._savePending = false;
					this.save();
				}
			}, 400);
		} else {
			this._savePending = true;
		}
	}

	flush() {
		if (this._saveTimeout !== null) {
			clearTimeout(this._saveTimeout);
			this._saveTimeout = null;
		}
		this._savePending = false;
		localStorage.setItem("settings", JSON.stringify(this));
	}
}

export let settings = new Settings();
