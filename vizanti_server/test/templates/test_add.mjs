import { runTemplateContract } from './template_test_helpers.mjs';
import assert from 'assert';
import fs from 'fs';

// Load the production script and replace only its transport import for testing.
let source = fs.readFileSync(new URL('../../public/templates/add/add_script.js', import.meta.url), 'utf8');
	source = source.replace("let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);\n\nlet rosbridge = rosbridgeModule.rosbridge;", '');
source = source.replace('rosbridge.get_all_topics()', 'sourceProvider.get_all_topics()');
source += '\nreturn { update_topics };';

// Minimal DOM behavior used by the add-widget script.
class ClassList {
	constructor() { this.values = new Set(); }
	add(value) { this.values.add(value); }
	remove(value) { this.values.delete(value); }
	contains(value) { return this.values.has(value); }
}

// Card clone/query behavior used when source-specific cards are created.
class Card {
	constructor(type, title, onclick) {
		this.dataset = { topic: type };
		this.title = title;
		this.desc = '';
		this.onclick = onclick;
	}

	querySelector(selector) {
		if (selector === '.card_title') return { get innerText() { return this.owner.title; }, set innerText(value) { this.owner.title = value; }, owner: this };
		if (selector === '.card_desc') return { get innerText() { return this.owner.desc; }, set innerText(value) { this.owner.desc = value; }, owner: this };
		return null;
	}

	getAttribute(name) { return name === 'onclick' ? this.onclick : null; }
	setAttribute(name, value) { if (name === 'onclick') this.onclick = value; }
	cloneNode() { return new Card(this.dataset.topic, this.title, this.onclick); }
}

// Generic element stub that records event handlers for simulated clicks.
function createElement(id, children = []) {
	return {
		id,
		children,
		style: { display: '' },
		classList: new ClassList(),
		listeners: {},
		innerHTML: '',
		addEventListener(type, callback) { this.listeners[type] = callback; },
		appendChild(child) { this.children.push(child); },
	};
}

describe('add plugin', function () {
	it('preserves the template contract', function () {
		runTemplateContract('add');
	});

	async function arrange() {
		const typeCards = [
			new Card('telemetry/battery', 'Battery', "addWidget('battery','')"),
			new Card('telemetry/odometry', 'Odometry', "addWidget('odom','')"),
		];
		const typeDiv = createElement('add_types_container', typeCards);
		const topicDiv = createElement('add_topics_container');
		const typeButton = createElement('add_set_type');
		const topicButton = createElement('add_set_topics');
		const elements = new Map([
			['icon_add_element', createElement('icon_add_element')],
			['add_set_type', typeButton], ['add_set_topics', topicButton],
			['add_topics_container', topicDiv], ['add_types_container', typeDiv],
		]);
		const calls = [];
		const sourceProvider = {
			async get_all_topics() {
				calls.push('get_all_topics');
				return {
					topics: ['/battery', '/ignored', '/odom'],
					types: ['telemetry/battery', 'telemetry/image', 'telemetry/odometry'],
				};
			},
		};
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		const { update_topics } = await new AsyncFunction(
			'sourceProvider', 'document', `return (async () => { ${source} })();`
		)(sourceProvider, { getElementById(id) { return elements.get(id); } });
		return { calls, typeDiv, topicDiv, typeButton, topicButton, update_topics };
	}

	it('queries available sources when initialized', async function () {
		const { calls } = await arrange();
		assert.deepEqual(calls, ['get_all_topics']);
	});

	it('creates cards only for source types supported by installed widgets', async function () {
		const { topicDiv } = await arrange();
		assert.equal(topicDiv.children.length, 2);
		assert.equal(topicDiv.children[0].title, '/battery');
		assert.equal(topicDiv.children[1].title, '/odom');
	});

	it('copies matching card metadata and assigns the source to its action', async function () {
		const { topicDiv } = await arrange();
		assert.equal(topicDiv.children[0].desc, 'Battery [telemetry/battery]');
		assert.equal(topicDiv.children[0].onclick, "addWidget('battery','/battery')");
	});

	it('shows source cards when the source tab is clicked', async function () {
		const { typeDiv, topicDiv, typeButton, topicButton } = await arrange();
		topicButton.listeners.click({});
		assert.equal(typeDiv.style.display, 'none');
		assert.equal(topicDiv.style.display, 'block');
		assert.equal(topicButton.classList.contains('active-tab'), true);
		assert.equal(typeButton.classList.contains('active-tab'), false);
	});

	it('returns to widget type cards when the type tab is clicked', async function () {
		const { typeDiv, topicDiv, typeButton, topicButton } = await arrange();
		topicButton.listeners.click({});
		typeButton.listeners.click({});
		assert.equal(typeDiv.style.display, 'block');
		assert.equal(topicDiv.style.display, 'none');
		assert.equal(typeButton.classList.contains('active-tab'), true);
		assert.equal(topicButton.classList.contains('active-tab'), false);
	});

	it('refreshes sources when requested explicitly', async function () {
		const { calls, update_topics } = await arrange();
		await update_topics();
		assert.equal(calls.length, 2);
	});
});
