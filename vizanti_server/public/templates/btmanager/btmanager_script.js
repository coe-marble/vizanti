let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let settings = persistentModule.settings;
let Status = StatusModule.Status;
let status = new Status(document.getElementById('{uniqueID}_icon'), document.getElementById('{uniqueID}_status'));

const icon = document.getElementById('{uniqueID}_icon');
const panel = document.getElementById('{uniqueID}_panel');
const resizeHandle = document.getElementById('{uniqueID}_resize');
const iconBar = document.getElementById('icon_bar');
const rootInput = document.getElementById('{uniqueID}_root');
const configureButton = document.getElementById('{uniqueID}_configure');
const githubUrlInput = document.getElementById('{uniqueID}_github_url');
const githubRefInput = document.getElementById('{uniqueID}_github_ref');
const githubSubdirectoryInput = document.getElementById('{uniqueID}_github_subdirectory');
const githubPullButton = document.getElementById('{uniqueID}_github_pull');
const fileList = document.getElementById('{uniqueID}_files');
const openButton = document.getElementById('{uniqueID}_open');
const newButton = document.getElementById('{uniqueID}_new');
const newSubtreeButton = document.getElementById('{uniqueID}_new_subtree');
const deleteFileButton = document.getElementById('{uniqueID}_delete_file');
const playButton = document.getElementById('{uniqueID}_play');
const debugButton = document.getElementById('{uniqueID}_debug');
const stopButton = document.getElementById('{uniqueID}_stop');
const createModal = document.getElementById('{uniqueID}_create_modal');
const createTitle = document.getElementById('{uniqueID}_create_title');
const createStatus = document.getElementById('{uniqueID}_create_status');
const createLabel = document.getElementById('{uniqueID}_create_label');
const createInput = document.getElementById('{uniqueID}_create_input');
const createHint = document.getElementById('{uniqueID}_create_hint');
const createConfirm = document.getElementById('{uniqueID}_create_confirm');
const createCancel = document.getElementById('{uniqueID}_create_cancel');
const deleteFileModal = document.getElementById('{uniqueID}_delete_file_modal');
const deleteFileMessage = document.getElementById('{uniqueID}_delete_file_message');
const deleteFileConfirm = document.getElementById('{uniqueID}_delete_file_confirm');
const deleteFileCancel = document.getElementById('{uniqueID}_delete_file_cancel');
const maximizeButton = document.getElementById('{uniqueID}_maximize');
const title = document.getElementById('{uniqueID}_title');
const editor = document.getElementById('{uniqueID}_xml');
const graph = document.getElementById('{uniqueID}_graph');
const tree = document.getElementById('{uniqueID}_tree');
const textTabButton = document.getElementById('{uniqueID}_text_tab_button');
const treeTabButton = document.getElementById('{uniqueID}_tree_tab_button');
const textTab = document.getElementById('{uniqueID}_text_tab');
const treeTab = document.getElementById('{uniqueID}_tree_tab');
const workspace = treeTab.querySelector('.btmanager-workspace');
const saveButton = document.getElementById('{uniqueID}_save');
const validateButton = document.getElementById('{uniqueID}_validate');
const undoButton = document.getElementById('{uniqueID}_undo');
const redoButton = document.getElementById('{uniqueID}_redo');
const saveStatus = document.getElementById('{uniqueID}_save_status');
const nodeSearch = document.getElementById('{uniqueID}_node_search');
const nodeList = document.getElementById('{uniqueID}_node_list');
const inspector = document.getElementById('{uniqueID}_inspector');
const propertyPanel = document.getElementById('{uniqueID}_properties');
const propertyContent = document.getElementById('{uniqueID}_property_content');
const componentsToggle = document.getElementById('{uniqueID}_components_toggle');
const componentsResize = document.getElementById('{uniqueID}_components_resize');

const defaultNodeCatalog = [
    { name: 'Sequence', kind: 'Control', tags: ['control', 'and', 'series'] },
    { name: 'SequenceWithMemory', kind: 'Control', tags: ['control', 'sequence', 'memory'] },
    { name: 'ReactiveSequence', kind: 'Control', tags: ['control', 'sequence', 'reactive'] },
    { name: 'Fallback', kind: 'Control', tags: ['control', 'or', 'selector'] },
    { name: 'ReactiveFallback', kind: 'Control', tags: ['control', 'fallback', 'reactive'] },
    { name: 'IfThenElse', kind: 'Control', tags: ['control', 'if', 'branch'] },
    { name: 'WhileDoElse', kind: 'Control', tags: ['control', 'while', 'loop'] },
    { name: 'Parallel', kind: 'Control', tags: ['control', 'parallel', 'multi'] },
    { name: 'RetryUntilSuccessful', kind: 'Decorator', tags: ['decorator', 'retry', 'loop'] },
    { name: 'RetryUntilFailure', kind: 'Decorator', tags: ['decorator', 'retry', 'loop'] },
    { name: 'Repeat', kind: 'Decorator', tags: ['decorator', 'repeat', 'loop'] },
    { name: 'RunOnce', kind: 'Decorator', tags: ['decorator', 'once'] },
    { name: 'Delay', kind: 'Decorator', tags: ['decorator', 'delay', 'timer'] },
    { name: 'Timeout', kind: 'Decorator', tags: ['decorator', 'timeout', 'timer'] },
    { name: 'KeepRunningUntilFailure', kind: 'Decorator', tags: ['decorator', 'running', 'failure'] },
    { name: 'ForceSuccess', kind: 'Decorator', tags: ['decorator', 'success'] },
    { name: 'ForceFailure', kind: 'Decorator', tags: ['decorator', 'failure'] },
    { name: 'Inverter', kind: 'Decorator', tags: ['decorator', 'invert', 'negate'] },
    { name: 'Condition', kind: 'Condition', tags: ['condition', 'check', 'predicate'] },
    { name: 'AlwaysSuccess', kind: 'Condition', tags: ['condition', 'success'] },
    { name: 'AlwaysFailure', kind: 'Condition', tags: ['condition', 'failure'] },
    { name: 'BlackboardCheckBool', kind: 'Condition', tags: ['condition', 'blackboard', 'bool'] },
    { name: 'BlackboardCheckString', kind: 'Condition', tags: ['condition', 'blackboard', 'string'] },
    { name: 'Action', kind: 'Action', tags: ['action', 'task', 'behavior'] },
    { name: 'Wait', kind: 'Action', tags: ['wait', 'delay', 'timer'] },
    { name: 'Sleep', kind: 'Action', tags: ['action', 'sleep', 'timer'] },
    { name: 'SetBlackboard', kind: 'Action', tags: ['action', 'blackboard', 'set'] },
    { name: 'UnsetBlackboard', kind: 'Action', tags: ['action', 'blackboard', 'unset'] },
    { name: 'Script', kind: 'Action', tags: ['action', 'script'] },
    { name: 'SubTree', kind: 'SubTree', group: 'SubTrees', tags: ['subtree', 'tree', 'reuse'] },
];
let nodeCatalog = defaultNodeCatalog.map(node => ({ ...node, source: 'Built-in', ports: [] }));
let bundledNodeCatalog = [];

let rootPath = '';
let selectedPath = '';
let revision = '';
let savedContent = '';
let maximized = false;
let componentsHidden = false;
let componentsWidth = 0;
let runtimeMode = '';
let inspectedNode = null;
let inspectedElement = null;
let treeViewBox = '';
let longPressTimer;
let isLongPress = false;
const expandedSubtrees = new Set();
let includedSubtrees = [];
const includedTreeDefinitions = new Map();
const undoStack = [];
const redoStack = [];
let createMode = '';

if (settings.hasOwnProperty('{uniqueID}')) {
	rootPath = settings['{uniqueID}'].root_path ?? '';
	githubUrlInput.value = settings['{uniqueID}'].github_url ?? '';
	githubRefInput.value = settings['{uniqueID}'].github_ref ?? 'main';
	githubSubdirectoryInput.value = settings['{uniqueID}'].github_subdirectory ?? '';
	panel.style.width = settings['{uniqueID}'].panel_width ?? '';
	maximized = settings['{uniqueID}'].maximized ?? false;
	componentsHidden = settings['{uniqueID}'].components_hidden ?? false;
	componentsWidth = settings['{uniqueID}'].components_width ?? 0;
}
rootInput.value = rootPath;

function saveSettings() {
	settings['{uniqueID}'] = {
		root_path: rootPath,
		github_url: githubUrlInput.value,
		github_ref: githubRefInput.value,
		github_subdirectory: githubSubdirectoryInput.value,
		panel_width: panel.style.width,
		maximized,
		components_hidden: componentsHidden,
		components_width: componentsWidth,
	};
	settings.save();
}

githubUrlInput.addEventListener('input', saveSettings);
githubRefInput.addEventListener('input', saveSettings);
githubSubdirectoryInput.addEventListener('input', saveSettings);

async function loadBundledNodeCatalog() {
	try {
		const catalog = await request('/bt/catalog');
		if (!Array.isArray(catalog.nodes)) throw new Error('Bundled Nav2 catalog has an invalid format.');
		bundledNodeCatalog = catalog.nodes.filter(node => typeof node.name === 'string' && typeof node.kind === 'string');
	} catch (error) {
		console.warn('BT Manager Nav2 catalog unavailable:', error.message);
	}
}

function setMaximized(value) {
	maximized = value;
	panel.classList.toggle('btmanager-maximized', maximized);
	maximizeButton.textContent = maximized ? '⊡' : '⛶';
	maximizeButton.title = maximized ? 'Restore editor size' : 'Maximize editor';
	maximizeButton.setAttribute('aria-label', maximizeButton.title);
}

function setComponentsHidden(value) {
	componentsHidden = value;
	workspace.classList.toggle('btmanager-components-hidden', componentsHidden);
	componentsToggle.textContent = componentsHidden ? '›' : '‹';
	componentsToggle.title = componentsHidden ? 'Show components' : 'Hide components';
	componentsToggle.setAttribute('aria-label', componentsToggle.title);
}

function updateRuntimeControls() {
	const active = Boolean(runtimeMode);
	playButton.disabled = active || !selectedPath;
	debugButton.disabled = active || !selectedPath;
	stopButton.disabled = !active;
	newButton.disabled = active;
	openButton.disabled = active;
	fileList.disabled = active || !rootPath;
	playButton.classList.toggle('active', runtimeMode === 'play');
	debugButton.classList.toggle('active', runtimeMode === 'debug');
	editor.disabled = active || !selectedPath;
	saveButton.disabled = active || !selectedPath;
	validateButton.disabled = active || !selectedPath;
}

function setRuntimeMode(mode) {
	runtimeMode = mode;
	panel.classList.toggle('btmanager-runtime-mode', Boolean(runtimeMode));
	updateTitle();
	updateSubtreeAction();
	updateRuntimeControls();
	if (selectedPath && editor.value) {
		try {
			renderGraphPreservingView(editor.value);
		} catch (error) {
			graph.textContent = error.message;
		}
	}
	if (inspectedNode) renderInspector(inspectedNode, inspectedElement);
}

function renderGraphPreservingView(xml) {
	const currentCanvas = tree.querySelector('.btmanager-tree-canvas');
	treeViewBox = currentCanvas?.getAttribute('viewBox') || treeViewBox;
	renderGraph(xml);
}

function setComponentsWidth(width) {
	const minimum = 220;
	const available = workspace.clientWidth;
	const maximum = available > 0 ? Math.max(minimum, available - 280) : Math.max(minimum, width);
	componentsWidth = Math.max(minimum, Math.min(maximum, Math.round(width)));
	workspace.style.setProperty('--btmanager-components-width', `${componentsWidth}px`);
}

function initializeComponentsWidth() {
	if (componentsWidth > 0) {
		setComponentsWidth(componentsWidth);
		return;
	}
	const context = document.createElement('canvas').getContext('2d');
	if (!context) {
		setComponentsWidth(300);
		return;
	}
	context.font = getComputedStyle(nodeList).font;
	const widestEntry = Math.max(0, ...nodeCatalog.map(node => context.measureText(node.name).width + context.measureText(node.source || '').width + 54));
	setComponentsWidth(Math.max(300, widestEntry));
}

function syncPanelTop() {
	panel.style.top = `${iconBar.offsetHeight}px`;
}

function updateTitle() {
	const fileName = selectedPath ? `: ${selectedPath}` : '';
	const unsavedMarker = selectedPath && editor.value !== savedContent ? ' *' : '';
	const modeMarker = runtimeMode ? ` — ${runtimeMode === 'debug' ? 'Debug' : 'Runtime'}` : '';
	title.textContent = `Behavior Trees${fileName}${unsavedMarker}${modeMarker}`;
}

function updateSubtreeAction() {
	newSubtreeButton.disabled = !selectedPath || Boolean(runtimeMode);
	deleteFileButton.disabled = !selectedPath || Boolean(runtimeMode);
}

function clearSelectedFile() {
	runtimeMode = '';
	panel.classList.remove('btmanager-runtime-mode');
	selectedPath = '';
	revision = '';
	savedContent = '';
	includedSubtrees = [];
	includedTreeDefinitions.clear();
	treeViewBox = '';
	editor.value = '';
	renderInspector(null);
	graph.textContent = 'Select an XML file to inspect its behavior tree.';
	tree.textContent = 'Select an XML file to inspect its behavior tree.';
	updateTitle();
	updateSubtreeAction();
	updateRuntimeControls();
}

function showCreateDialog(mode) {
	createMode = mode;
	const isFile = mode === 'file';
	createTitle.textContent = isFile ? 'New Behavior Tree File' : 'New Local SubTree';
	createLabel.textContent = isFile ? 'XML filename:' : 'SubTree ID:';
	createInput.value = isFile ? 'new_tree.xml' : 'NewSubTree';
	createHint.textContent = isFile
		? 'Use a relative .xml path inside the configured XML folder.'
		: 'Creates an editable BehaviorTree definition in the current XML file.';
	createStatus.textContent = '';
	createConfirm.textContent = isFile ? 'Create file' : 'Create SubTree';
	openModal(createModal.id);
	setTimeout(() => createInput.select(), 0);
}

function closeCreateDialog() {
	createMode = '';
	closeModal(createModal.id);
}

function updateHistoryButtons() {
	undoButton.disabled = undoStack.length === 0;
	redoButton.disabled = redoStack.length === 0;
}

function rememberDocumentState() {
	if (!selectedPath) return;
	undoStack.push(editor.value);
	if (undoStack.length > 100) undoStack.shift();
	redoStack.length = 0;
	updateHistoryButtons();
}

function restoreDocumentState(content) {
	editor.value = content;
	renderInspector(null);
	updateTitle();
	renderGraph(content);
	updateHistoryButtons();
}

async function request(path, options = {}) {
	const response = await fetch(`${base_url}${path}`, options);
	const data = await response.json();
	if (!response.ok) throw new Error(data.error || 'Server request failed.');
	return data;
}

function renderGraph(xml) {
	const documentRoot = new DOMParser().parseFromString(xml, 'application/xml');
	const parserError = documentRoot.querySelector('parsererror');
	if (parserError) throw new Error('XML parser error.');
	const root = documentRoot.documentElement;
	const lines = [];
	function visit(element, depth) {
		if (element.nodeType !== Node.ELEMENT_NODE) return;
		const attributes = Array.from(element.attributes).map(attribute => `${attribute.name}=${attribute.value}`).join(' ');
		lines.push(`${'  '.repeat(depth)}${element.tagName}${attributes ? `  ${attributes}` : ''}`);
		Array.from(element.children).forEach(child => visit(child, depth + 1));
	}
	visit(root, 0);
	graph.textContent = lines.join('\n');
	renderNodeCatalog(documentRoot);
	renderTreeCanvas(root);
}

function renderTreeCanvas(documentRoot) {
	const behaviorTrees = Array.from(documentRoot.children).filter(element => element.tagName === 'BehaviorTree');
	const mainTreeId = documentRoot.getAttribute('main_tree_to_execute');
	const behaviorTree = behaviorTrees.find(element => element.getAttribute('ID') === mainTreeId) || behaviorTrees[0];
	const roots = behaviorTree ? Array.from(behaviorTree.children) : Array.from(documentRoot.children).filter(element => element.tagName !== 'TreeNodesModel');
	const subtreeDefinitions = new Map(behaviorTrees.map(element => [element.getAttribute('ID'), { element, readOnly: false }]));
	includedTreeDefinitions.forEach((definition, treeId) => {
		if (!subtreeDefinitions.has(treeId)) subtreeDefinitions.set(treeId, definition);
	});
	if (roots.length === 0) {
		tree.textContent = 'No behavior tree nodes found.';
		return;
	}

	let nextLeafX = 48;
	let nextId = 0;
	const buildNode = (element, depth, path, expansionStack = new Set(), readOnly = false, sourcePath = '') => {
		const key = `${element.tagName}:${path}`;
		const subtreeId = element.tagName === 'SubTree' ? element.getAttribute('ID') : null;
		const definition = subtreeId ? subtreeDefinitions.get(subtreeId) : null;
		const canExpand = Boolean(definition && !expansionStack.has(subtreeId));
		const expanded = canExpand && expandedSubtrees.has(key);
		const nextExpansionStack = new Set(expansionStack);
		if (expanded) nextExpansionStack.add(subtreeId);
		const childElements = expanded ? Array.from(definition.element.children) : Array.from(element.children);
		const childReadOnly = expanded ? definition.readOnly : readOnly;
		const childSourcePath = expanded ? definition.sourcePath : sourcePath;
		const children = childElements.filter(child => child.tagName !== 'TreeNodesModel').map((child, index) => buildNode(child, depth + 1, `${path}.${index}`, nextExpansionStack, childReadOnly, childSourcePath));
		const x = children.length === 0 ? nextLeafX : children.reduce((sum, child) => sum + child.x, 0) / children.length;
		if (children.length === 0) nextLeafX += 220;
		const nodeSourcePath = definition?.readOnly ? definition.sourcePath : sourcePath;
		return { id: nextId++, key, element, children, x, y: 36 + depth * 110, isSubtree: Boolean(subtreeId), canExpand, expanded, readOnly, sourcePath: nodeSourcePath };
	};
	const nodes = roots.map((element, index) => buildNode(element, 0, String(index)));
	const allNodes = [];
	const collect = node => {
		allNodes.push(node);
		node.children.forEach(collect);
	};
	nodes.forEach(collect);
	const setParents = parent => parent.children.forEach(child => {
		child.parent = parent;
		setParents(child);
	});
	nodes.forEach(node => {
		node.parent = null;
		setParents(node);
	});
	const svgNamespace = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNamespace, 'svg');
	svg.classList.add('btmanager-tree-canvas');
	svg.setAttribute('tabindex', '0');
	const canvasWidth = Math.max(640, ...allNodes.map(node => node.x + 210));
	const canvasHeight = Math.max(360, ...allNodes.map(node => node.y + 90));
	svg.setAttribute('width', String(canvasWidth));
	svg.setAttribute('height', String(canvasHeight));
	svg.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
	const camera = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
	const savedViewBox = treeViewBox.trim().split(/\s+/).map(Number);
	if (savedViewBox.length === 4 && savedViewBox.every(Number.isFinite) && savedViewBox[2] > 0 && savedViewBox[3] > 0) {
		[camera.x, camera.y, camera.width, camera.height] = savedViewBox;
	}
	const updateCamera = () => {
		treeViewBox = `${camera.x} ${camera.y} ${camera.width} ${camera.height}`;
		svg.setAttribute('viewBox', treeViewBox);
	};
	updateCamera();
	const svgPoint = event => {
		const point = svg.createSVGPoint();
		point.x = event.clientX;
		point.y = event.clientY;
		return point.matrixTransform(svg.getScreenCTM().inverse());
	};
	svg.addEventListener('wheel', event => {
		event.preventDefault();
		event.stopPropagation();
		const point = svgPoint(event);
		const currentZoom = canvasWidth / camera.width;
		const requestedZoom = currentZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15);
		const zoom = Math.max(0.35, Math.min(3, requestedZoom));
		const ratio = currentZoom / zoom;
		camera.x = point.x - (point.x - camera.x) * ratio;
		camera.y = point.y - (point.y - camera.y) * ratio;
		camera.width *= ratio;
		camera.height *= ratio;
		updateCamera();
	}, { passive: false });
	svg.addEventListener('pointerdown', event => {
		if (event.defaultPrevented) return;
		event.preventDefault();
		const startClient = { x: event.clientX, y: event.clientY };
		const initialCamera = { ...camera };
		svg.classList.add('panning');
		svg.setPointerCapture(event.pointerId);
		const move = moveEvent => {
			const bounds = svg.getBoundingClientRect();
			camera.x = initialCamera.x - (moveEvent.clientX - startClient.x) * initialCamera.width / bounds.width;
			camera.y = initialCamera.y - (moveEvent.clientY - startClient.y) * initialCamera.height / bounds.height;
			updateCamera();
		};
		const stop = stopEvent => {
			svg.classList.remove('panning');
			svg.removeEventListener('pointermove', move);
			svg.removeEventListener('pointerup', stop);
			svg.removeEventListener('pointercancel', stop);
			if (svg.hasPointerCapture(stopEvent.pointerId)) svg.releasePointerCapture(stopEvent.pointerId);
		};
		svg.addEventListener('pointermove', move);
		svg.addEventListener('pointerup', stop);
		svg.addEventListener('pointercancel', stop);
	});
	const edgeLayer = document.createElementNS(svgNamespace, 'g');
	const slotLayer = document.createElementNS(svgNamespace, 'g');
	const nodeLayer = document.createElementNS(svgNamespace, 'g');
	svg.append(edgeLayer, slotLayer, nodeLayer);
	const nodeElements = new Map();
	const edgeElements = [];
	const nodeType = node => nodeCatalog.find(component => component.name === node.element.tagName)?.kind || 'Action';
	const runtimeStateFor = node => runtimeMode && node.parent === null ? 'Running' : 'Idle';
	const nodeColor = type => ({ Control: '#245b8f', Decorator: '#68458a', Action: '#386b42', Condition: '#8b7131', SubTree: '#276c72' }[type] || '#4b4b4b');
	const updateGeometry = () => {
		edgeElements.forEach(({ edge, parent, child }) => {
			const startX = parent.x + 90;
			const startY = parent.y + 60;
			const endX = child.x + 90;
			const endY = child.y;
			const middleY = (startY + endY) / 2;
			edge.setAttribute('d', `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`);
		});
		allNodes.forEach(node => nodeElements.get(node).setAttribute('transform', `translate(${node.x} ${node.y})`));
	};
	let selectedTreeNode = null;
	const selectTreeNode = node => {
		selectedTreeNode = node;
		nodeElements.forEach((element, candidate) => element.classList.toggle('selected', candidate === node));
		const component = nodeCatalog.find(item => item.name === node.element.tagName);
		renderInspector({
			...(component || { name: node.element.tagName, kind: nodeType(node), source: 'XML', ports: [] }),
			readOnly: node.readOnly,
			sourcePath: node.sourcePath,
			source: node.readOnly || node.sourcePath ? 'Include' : component?.source || 'XML',
			structure: describeTreeStructure(node),
		}, node.element);
		svg.focus({ preventScroll: true });
	};
	const childPolicyFor = node => {
		const component = nodeCatalog.find(candidate => candidate.name === node.element.tagName);
		if (component?.children) return component.children;
		const type = nodeType(node);
		if (type === 'Control') return { mode: 'list' };
		if (type === 'Decorator') return { mode: 'fixed', slots: 1 };
		return { mode: 'none' };
	};
	const canAcceptChild = node => {
		if (node.readOnly) return false;
		const policy = childPolicyFor(node);
		return policy.mode === 'list' || (policy.mode === 'fixed' && node.children.length < policy.slots);
	};
	const canReplace = node => !node.readOnly && allNodes.length === 1 && node.parent === null;
	const createComponentElement = (xmlDocument, component) => {
		const element = component.kind === 'SubTree' && component.name !== 'SubTree'
			? xmlDocument.createElement('SubTree')
			: xmlDocument.createElement(component.name);
		if (component.kind === 'SubTree' && component.name !== 'SubTree') element.setAttribute('ID', component.name);
		return element;
	};
	const ensureInclude = (xmlDocument, includePath) => {
		if (!includePath) return;
		const root = xmlDocument.documentElement;
		const hasInclude = Array.from(root.children).some(element => element.tagName === 'include' && element.getAttribute('path') === includePath);
		if (hasInclude) return;
		const include = xmlDocument.createElement('include');
		include.setAttribute('path', includePath);
		const firstTree = Array.from(root.children).find(element => element.tagName === 'BehaviorTree');
		root.insertBefore(include, firstTree || null);
	};
	const serializeDocument = xmlDocument => {
		const declaration = editor.value.match(/^\s*(<\?xml[^>]*\?>\s*)/i)?.[1] || '';
		editor.value = `${declaration}${new XMLSerializer().serializeToString(xmlDocument.documentElement)}`;
		updateTitle();
		renderGraphPreservingView(editor.value);
	};
	const addComponent = (parent, component, childIndex = parent.children.length) => {
		if (!canAcceptChild(parent)) {
			status.setError('Drop onto a node with an available child slot.');
			return;
		}
		try {
			const xmlDocument = parent.element.ownerDocument;
			rememberDocumentState();
			ensureInclude(xmlDocument, component.includePath);
			const child = createComponentElement(xmlDocument, component);
			parent.element.insertBefore(child, parent.element.children[childIndex] || null);
			serializeDocument(xmlDocument);
			status.setOK(`${component.name} added to ${parent.element.tagName}.`);
		} catch (error) {
			status.setError(`Unable to add component: ${error.message}`);
		}
	};
	const replaceComponent = (node, component) => {
		if (!canReplace(node)) return;
		try {
			const xmlDocument = node.element.ownerDocument;
			rememberDocumentState();
			ensureInclude(xmlDocument, component.includePath);
			node.element.parentElement.replaceChild(createComponentElement(xmlDocument, component), node.element);
			serializeDocument(xmlDocument);
			status.setOK(`${node.element.tagName} replaced with ${component.name}.`);
		} catch (error) {
			status.setError(`Unable to replace node: ${error.message}`);
		}
	};
	svg.addEventListener('keydown', event => {
		if (event.key !== 'Delete' || !selectedTreeNode) return;
		event.preventDefault();
		event.stopPropagation();
		if (runtimeMode) {
			status.setError('Stop runtime before editing the behavior tree.');
			return;
		}
		if (selectedTreeNode.readOnly) {
			status.setError('Included subtree definitions are read-only. Open their source file to edit them.');
			return;
		}
		if (!selectedTreeNode.parent) {
			status.setError('The behavior tree root cannot be deleted.');
			return;
		}
		try {
			const xmlDocument = selectedTreeNode.element.ownerDocument;
			rememberDocumentState();
			selectedTreeNode.parent.element.removeChild(selectedTreeNode.element);
			const declaration = editor.value.match(/^\s*(<\?xml[^>]*\?>\s*)/i)?.[1] || '';
			editor.value = `${declaration}${new XMLSerializer().serializeToString(xmlDocument.documentElement)}`;
			updateTitle();
			renderGraph(editor.value);
			status.setOK('Node deleted.');
		} catch (error) {
			status.setError(`Unable to delete node: ${error.message}`);
		}
	});
	allNodes.forEach(parent => parent.children.forEach(child => {
		const edge = document.createElementNS(svgNamespace, 'path');
		edge.classList.add('btmanager-tree-edge');
		edgeLayer.appendChild(edge);
		edgeElements.push({ edge, parent, child });
	}));
	allNodes.filter(canAcceptChild).forEach(parent => {
		const policy = childPolicyFor(parent);
		const isList = policy.mode === 'list';
		const childCenters = parent.children.map(child => child.x + 90);
		const slotCenters = !isList ? [parent.x + 90] : childCenters.length === 0 ? [parent.x + 90] : [
			childCenters[0] - 110,
			...childCenters.slice(0, -1).map((center, index) => (center + childCenters[index + 1]) / 2),
			childCenters[childCenters.length - 1] + 110,
		];
		const slotY = parent.y + 68;
		slotCenters.forEach((centerX, childIndex) => {
			const slot = document.createElementNS(svgNamespace, 'g');
			slot.classList.add('btmanager-tree-slot');
			slot.classList.add(isList ? 'list-slot' : 'fixed-slot');
			const rectangle = document.createElementNS(svgNamespace, 'rect');
			rectangle.setAttribute('x', String(centerX - 14));
			rectangle.setAttribute('y', String(slotY));
			rectangle.setAttribute('width', '28');
			rectangle.setAttribute('height', '20');
			rectangle.setAttribute('rx', '5');
			const label = document.createElementNS(svgNamespace, 'text');
			label.setAttribute('x', String(centerX - 5));
			label.setAttribute('y', String(slotY + 16));
			label.textContent = isList ? '+' : String(parent.children.length + 1);
			slot.append(rectangle, label);
			slot.addEventListener('dragover', event => {
				if (!event.dataTransfer.types.includes('application/x-btmanager-component')) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
			});
			slot.addEventListener('drop', event => {
				event.preventDefault();
				event.stopPropagation();
				try {
					addComponent(parent, JSON.parse(event.dataTransfer.getData('application/x-btmanager-component')), childIndex);
				} catch (error) {
					status.setError('The dropped component is invalid.');
				}
			});
			slot.addEventListener('pointerdown', event => event.stopPropagation());
			slotLayer.appendChild(slot);
		});
	});
	allNodes.forEach(node => {
		const group = document.createElementNS(svgNamespace, 'g');
		group.classList.add('btmanager-tree-node');
		if (runtimeMode) group.classList.add(`runtime-${runtimeStateFor(node).toLowerCase()}`);
		if (canAcceptChild(node)) group.classList.add('can-receive');
		if (node.parent === null) group.classList.add('root-node');
		if (node.readOnly) group.classList.add('read-only-node');
		const rectangle = document.createElementNS(svgNamespace, 'rect');
		rectangle.setAttribute('width', '180');
		rectangle.setAttribute('height', '60');
		rectangle.setAttribute('fill', nodeColor(nodeType(node)));
		const label = document.createElementNS(svgNamespace, 'text');
		label.setAttribute('x', '12');
		label.setAttribute('y', '27');
		const nodeName = node.element.getAttribute('name');
		label.textContent = nodeName || node.element.tagName;
		const type = document.createElementNS(svgNamespace, 'text');
		type.classList.add('btmanager-tree-node-type');
		type.setAttribute('x', '12');
		type.setAttribute('y', '46');
		const typeLabel = nodeName ? `${node.element.tagName} · ${nodeType(node)}` : nodeType(node);
		type.textContent = runtimeMode ? `${typeLabel} · ${runtimeStateFor(node)}` : typeLabel;
		group.append(rectangle, label, type);
		if (canReplace(node)) {
			group.addEventListener('dragover', event => {
				if (!event.dataTransfer.types.includes('application/x-btmanager-component')) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
				group.classList.add('replace-target');
			});
			group.addEventListener('dragleave', () => group.classList.remove('replace-target'));
			group.addEventListener('drop', event => {
				event.preventDefault();
				event.stopPropagation();
				group.classList.remove('replace-target');
				try {
					replaceComponent(node, JSON.parse(event.dataTransfer.getData('application/x-btmanager-component')));
				} catch (error) {
					status.setError('The dropped component is invalid.');
				}
			});
		}
		if (node.isSubtree && node.canExpand) {
			const toggle = document.createElementNS(svgNamespace, 'g');
			toggle.classList.add('btmanager-subtree-toggle');
			const circle = document.createElementNS(svgNamespace, 'circle');
			circle.setAttribute('cx', '162');
			circle.setAttribute('cy', '17');
			circle.setAttribute('r', '10');
			const toggleLabel = document.createElementNS(svgNamespace, 'text');
			toggleLabel.setAttribute('x', '158');
			toggleLabel.setAttribute('y', '22');
			toggleLabel.textContent = node.expanded ? '−' : '+';
			toggle.append(circle, toggleLabel);
			toggle.addEventListener('pointerdown', event => {
				event.preventDefault();
				event.stopPropagation();
				if (node.expanded) expandedSubtrees.delete(node.key);
				else expandedSubtrees.add(node.key);
				renderGraph(editor.value);
			});
			group.appendChild(toggle);
		}
		group.addEventListener('pointerdown', event => {
			event.preventDefault();
			event.stopPropagation();
			selectTreeNode(node);
		});
		nodeElements.set(node, group);
		nodeLayer.appendChild(group);
	});
	updateGeometry();
	tree.replaceChildren(svg);
}

function renderNodeCatalog(documentRoot) {
	const catalog = defaultNodeCatalog.map(node => ({ ...node, source: 'Built-in', ports: [] }));
	const seen = new Set(catalog.map(node => `${node.kind}:${node.name}`));
	const addNode = node => {
		const key = `${node.kind}:${node.name}`;
		if (!seen.has(key)) {
			seen.add(key);
			catalog.push(node);
		}
	};
	bundledNodeCatalog.forEach(node => addNode({
		...node,
		tags: node.tags || [node.kind.toLowerCase(), 'nav2', node.name.toLowerCase()],
		source: 'Nav2',
		ports: [],
	}));

	documentRoot.querySelectorAll('TreeNodesModel > *').forEach(model => {
		const kind = model.tagName;
		const name = model.getAttribute('ID') || model.getAttribute('id') || model.tagName;
		const ports = Array.from(model.children).filter(port => /^(input|output|inout)_port$/i.test(port.tagName)).map(port => ({
			name: port.getAttribute('name') || '',
			direction: port.tagName.replace('_port', ''),
			defaultValue: port.textContent.trim(),
		}));
		addNode({ name, kind, tags: [kind.toLowerCase(), name.toLowerCase()], source: 'Model', ports });
	});
	documentRoot.querySelectorAll('root > BehaviorTree[ID], root > BehaviorTree[id]').forEach(subtree => {
		const name = subtree.getAttribute('ID') || subtree.getAttribute('id');
		addNode({ name, kind: 'SubTree', group: 'SubTrees', tags: ['subtree', 'tree', name.toLowerCase()], source: 'Local', ports: [], readOnly: false });
	});
	includedSubtrees.forEach(subtree => {
		addNode({
			name: subtree.id,
			kind: 'SubTree',
			group: `Includes · ${subtree.source_path}`,
			tags: ['subtree', 'tree', 'include', subtree.id.toLowerCase()],
			source: 'Include',
			ports: [],
			readOnly: true,
			includePath: subtree.include_path,
		});
	});
	nodeCatalog = catalog;
	renderNodePalette();
}

function describeTreeStructure(node) {
	const component = nodeCatalog.find(candidate => candidate.name === node.element.tagName);
	return describeComponentStructure(component?.kind || 'Action', node.children.length, component?.children);
}

function describeComponentStructure(type, childCount = null, childPolicy = null) {
	if (childPolicy?.mode === 'fixed') {
		const slots = Number.isInteger(childPolicy.slots) && childPolicy.slots > 0 ? childPolicy.slots : 1;
		return {
			children: childCount === null ? `${slots} slots` : `${childCount} / ${slots} slots`,
			accepts: 'Any node',
			placement: 'Control, Decorator, root',
		};
	}
	if (childPolicy?.mode === 'list') {
		return {
			children: childCount === null ? 'List' : `List (${childCount})`,
			accepts: 'Any node',
			placement: 'Control, Decorator, root',
		};
	}
	if (type === 'Control') {
		return {
			children: childCount === null ? 'List' : `List (${childCount})`,
			accepts: 'Any node',
			placement: 'Control, Decorator, root',
		};
	}
	if (type === 'Decorator') {
		return {
			children: childCount === null ? '1 slot' : `${childCount} / 1 slot`,
			accepts: 'Any node',
			placement: 'Control, Decorator, root',
		};
	}
	if (type === 'SubTree') {
		return {
			children: 'Subtree reference',
			accepts: '—',
			placement: 'Control, Decorator, root',
		};
	}
	return {
		children: 'Leaf',
		accepts: '—',
		placement: 'Control, Decorator, root',
	};
}

function renderInspector(node, element = null) {
	if (!node) {
		inspectedNode = null;
		inspectedElement = null;
		inspector.textContent = 'Select a component to inspect its tree structure.';
		propertyPanel.hidden = true;
		propertyContent.replaceChildren();
		return;
	}
	inspectedNode = node;
	inspectedElement = element;
	const details = document.createElement('dl');
	const appendDetail = (label, value) => {
		const term = document.createElement('dt');
		term.textContent = label;
		const description = document.createElement('dd');
		description.textContent = value;
		details.append(term, description);
	};
	appendDetail('Component', node.name);
	if (element?.getAttribute('name')) appendDetail('Name', element.getAttribute('name'));
	appendDetail('Type', node.kind);
	appendDetail('Source', node.source);
	if (node.readOnly) appendDetail('Access', 'Read-only in this file');
	if (node.sourcePath) {
		appendDetail('Source file', node.sourcePath);
		const openSource = document.createElement('button');
		openSource.type = 'button';
		openSource.textContent = 'Open source file';
		openSource.addEventListener('click', () => loadFile(node.sourcePath));
		const sourceAction = document.createElement('dd');
		sourceAction.appendChild(openSource);
		details.appendChild(sourceAction);
	}
	renderPropertyEditor(node, element);
	const structure = node.structure || describeComponentStructure(node.kind);
	appendDetail('Children', structure.children);
	appendDetail('Accepts', structure.accepts);
	appendDetail('Placement', structure.placement);
	inspector.replaceChildren(details);
}

function renderPropertyEditor(node, element) {
	propertyPanel.hidden = !element;
	propertyContent.replaceChildren();
	if (!element) return;
	if (node.readOnly || runtimeMode) {
		const message = document.createElement('p');
		message.textContent = runtimeMode ? 'Runtime attributes are read-only.' : 'This included subtree definition is read-only. Open its source file to edit attributes.';
		const attributes = Array.from(element.attributes);
		if (attributes.length === 0) {
			propertyContent.appendChild(message);
			return;
		}
		const details = document.createElement('dl');
		details.className = 'btmanager-readonly-attributes';
		attributes.forEach(attribute => {
			const name = document.createElement('dt');
			name.textContent = attribute.name;
			const value = document.createElement('dd');
			value.textContent = attribute.value;
			details.append(name, value);
		});
		propertyContent.append(message, details);
		return;
	}
	const list = document.createElement('div');
	list.className = 'btmanager-attribute-list';
	let persistTimer;
	let historyRecorded = false;
	const persistAttributes = () => {
		try {
			const values = Array.from(list.querySelectorAll('.btmanager-attribute-row')).map(row => {
				const [nameInput, valueInput] = row.querySelectorAll('input');
				return { name: nameInput.value.trim(), value: valueInput.value };
			}).filter(attribute => attribute.name);
			const names = new Set();
			values.forEach(attribute => {
				if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(attribute.name)) throw new Error(`Invalid attribute name: ${attribute.name}`);
				if (names.has(attribute.name)) throw new Error(`Duplicate attribute: ${attribute.name}`);
				names.add(attribute.name);
			});
			if (!historyRecorded) {
				rememberDocumentState();
				historyRecorded = true;
			}
			Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name));
			values.forEach(attribute => element.setAttribute(attribute.name, attribute.value));
			const declaration = editor.value.match(/^\s*(<\?xml[^>]*\?>\s*)/i)?.[1] || '';
			editor.value = `${declaration}${new XMLSerializer().serializeToString(element.ownerDocument.documentElement)}`;
			updateTitle();
			status.setOK('Attributes updated.');
		} catch (error) {
			status.setError(error.message);
		}
	};
	const schedulePersist = () => {
		clearTimeout(persistTimer);
		persistTimer = setTimeout(persistAttributes, 250);
	};
	const addRow = (name = '', value = '') => {
		const row = document.createElement('div');
		row.className = 'btmanager-attribute-row';
		const nameInput = document.createElement('input');
		nameInput.placeholder = 'name';
		nameInput.value = name;
		const valueInput = document.createElement('input');
		valueInput.placeholder = 'value';
		valueInput.value = value;
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'btmanager-attribute-remove';
		remove.textContent = '×';
		remove.title = 'Remove attribute';
		remove.addEventListener('click', () => {
			row.remove();
			schedulePersist();
		});
		row.append(nameInput, valueInput, remove);
		nameInput.addEventListener('input', schedulePersist);
		valueInput.addEventListener('input', schedulePersist);
		list.appendChild(row);
	};
	Array.from(element.attributes).forEach(attribute => addRow(attribute.name, attribute.value));
	const actions = document.createElement('div');
	actions.className = 'btmanager-inspector-actions';
	const add = document.createElement('button');
	add.type = 'button';
	add.textContent = 'Add attribute';
	add.addEventListener('click', () => addRow());
	actions.append(add);
	propertyContent.append(list, actions);
}

function selectTab(tab) {
	const showText = tab === 'text';
	textTab.hidden = !showText;
	treeTab.hidden = showText;
	textTabButton.classList.toggle('active-tab', showText);
	treeTabButton.classList.toggle('active-tab', !showText);
	textTabButton.setAttribute('aria-selected', String(showText));
	treeTabButton.setAttribute('aria-selected', String(!showText));
}

function setComponentDragState(active) {
	const canvas = tree.querySelector('.btmanager-tree-canvas');
	if (canvas) canvas.classList.toggle('dragging-component', active);
}

function renderNodePalette() {
	const query = nodeSearch.value.trim().toLowerCase();
	const visibleNodes = nodeCatalog.filter(node => {
		const haystack = `${node.name} ${node.kind} ${node.tags.join(' ')}`.toLowerCase();
		return !query || haystack.includes(query);
	});
	if (nodeList) {
		nodeList.replaceChildren();
		if (visibleNodes.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'btmanager-node-empty';
			empty.textContent = 'No matching nodes';
			nodeList.appendChild(empty);
			return;
		}
		const nodesByCategory = new Map();
		visibleNodes.forEach(node => {
			const category = node.group || (node.kind === 'Leaf' ? 'Action' : node.kind);
			if (!nodesByCategory.has(category)) nodesByCategory.set(category, []);
			nodesByCategory.get(category).push(node);
		});
		const categories = [
			'Control', 'Decorator', 'Action', 'Condition', 'SubTrees', 'SubTree', 'Leaf',
			...Array.from(nodesByCategory.keys()).filter(category => category.startsWith('Includes · ')),
		];
		categories.forEach(category => {
			const nodes = nodesByCategory.get(category);
			if (!nodes || nodes.length === 0) return;
			const section = document.createElement('details');
			section.className = 'btmanager-node-category';
			section.open = true;
			const summary = document.createElement('summary');
			summary.textContent = `${category} (${nodes.length})`;
			const items = document.createElement('div');
			items.className = 'btmanager-node-items';
			nodes.forEach(node => {
			const button = document.createElement('button');
			button.type = 'button';
			button.draggable = true;
			button.className = 'btmanager-node-item';
			button.title = node.name;
			const label = document.createElement('span');
			label.textContent = node.name;
			const kind = document.createElement('small');
			kind.textContent = node.source;
			button.append(label, kind);
			button.addEventListener('click', () => {
				nodeList.querySelectorAll('.btmanager-node-item').forEach(item => item.classList.toggle('active', item === button));
				renderInspector(node);
				status.setOK(`${node.name} selected`);
			});
			button.addEventListener('dragstart', event => {
				event.dataTransfer.effectAllowed = 'copy';
				event.dataTransfer.setData('application/x-btmanager-component', JSON.stringify({
					name: node.name, kind: node.kind, source: node.source, includePath: node.includePath,
				}));
				setComponentDragState(true);
			});
			button.addEventListener('dragend', () => setComponentDragState(false));
			items.appendChild(button);
		});
			section.append(summary, items);
			nodeList.appendChild(section);
		});
	}
	initializeComponentsWidth();
}

async function loadFile(path) {
	if (runtimeMode) {
		status.setError('Stop runtime before opening another behavior tree.');
		return;
	}
	if (selectedPath && path !== selectedPath && editor.value !== savedContent) {
		if (await confirm(`Save changes to ${selectedPath} before switching?`)) {
			if (!await saveCurrentFile()) return;
		}
	}

	try {
		includedSubtrees = [];
		treeViewBox = '';
		const data = await request(`/bt/file/${encodeURIComponent(path).replace(/%2F/g, '/')}`);
		selectedPath = data.path;
		fileList.value = selectedPath;
		updateSubtreeAction();
		revision = data.revision;
		savedContent = data.content;
		editor.value = data.content;
		renderInspector(null);
		undoStack.length = 0;
		redoStack.length = 0;
		updateHistoryButtons();
		updateRuntimeControls();
		updateTitle();
		renderGraph(data.content);
		await loadIncludedSubtrees(data.path);
		status.setOK();
	} catch (error) {
		status.setError(error.message);
	}
}

async function loadIncludedSubtrees(path) {
	try {
		const data = await request(`/bt/subtrees?path=${encodeURIComponent(path)}`);
		if (selectedPath !== path) return;
		includedSubtrees = data.subtrees;
		await loadIncludedTreeDefinitions(path);
		renderGraph(editor.value);
	} catch (error) {
		try {
			includedSubtrees = await loadIncludedSubtreesFromFiles(path);
			if (selectedPath !== path) return;
			await loadIncludedTreeDefinitions(path);
			renderGraph(editor.value);
		} catch (fallbackError) {
			includedSubtrees = [];
			status.setError(`Unable to load included subtrees: ${fallbackError.message}`);
		}
	}
}

async function loadIncludedTreeDefinitions(path) {
	const sourcePaths = [...new Set(includedSubtrees.map(subtree => subtree.source_path))];
	const definitions = await Promise.all(sourcePaths.map(async sourcePath => {
		const data = await request(`/bt/file/${encodeURIComponent(sourcePath).replace(/%2F/g, '/')}`);
		const documentRoot = new DOMParser().parseFromString(data.content, 'application/xml');
		if (documentRoot.querySelector('parsererror')) return [];
		return Array.from(documentRoot.querySelectorAll('root > BehaviorTree[ID], root > BehaviorTree[id]')).map(tree => ({
			id: tree.getAttribute('ID') || tree.getAttribute('id'),
			element: tree,
			readOnly: true,
			sourcePath,
		}));
	}));
	includedTreeDefinitions.clear();
	definitions.flat().forEach(definition => includedTreeDefinitions.set(definition.id, definition));
}

function relativeIncludePath(fromPath, toPath) {
	const fromParts = fromPath.split('/').slice(0, -1);
	const toParts = toPath.split('/');
	while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
		fromParts.shift();
		toParts.shift();
	}
	return [...fromParts.map(() => '..'), ...toParts].join('/') || '.';
}

async function loadIncludedSubtreesFromFiles(selectedFile) {
	const files = await request('/bt/files');
	const entries = await Promise.all(files.files.filter(file => file.path !== selectedFile && file.valid !== false).map(async file => {
		const data = await request(`/bt/file/${encodeURIComponent(file.path).replace(/%2F/g, '/')}`);
		const documentRoot = new DOMParser().parseFromString(data.content, 'application/xml');
		if (documentRoot.querySelector('parsererror')) return [];
		return Array.from(documentRoot.querySelectorAll('root > BehaviorTree[ID], root > BehaviorTree[id]')).map(tree => ({
			id: tree.getAttribute('ID') || tree.getAttribute('id'),
			source_path: file.path,
			include_path: relativeIncludePath(selectedFile, file.path),
		}));
	}));
	return entries.flat();
}

async function loadFiles() {
	try {
		const data = await request('/bt/files');
		fileList.replaceChildren();
		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = data.files.length === 0 ? 'No XML files found.' : 'Select a behavior tree…';
		fileList.appendChild(placeholder);
		data.files.forEach(file => {
			const option = document.createElement('option');
			option.value = file.path;
			option.textContent = `${file.valid === false ? '⚠ ' : ''}${file.path}`;
			option.title = file.validation_error || file.path;
			option.selected = file.path === selectedPath;
			fileList.appendChild(option);
		});
		fileList.disabled = data.files.length === 0;
		status.setOK();
	} catch (error) {
		fileList.replaceChildren();
		const option = document.createElement('option');
		option.textContent = error.message;
		fileList.appendChild(option);
		fileList.disabled = true;
		status.setError(error.message);
	}
}

configureButton.addEventListener('click', async () => {
	try {
		const data = await request('/bt/configure', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: rootInput.value })
		});
		rootPath = data.root;
		rootInput.value = rootPath;
		saveSettings();
		await loadFiles();
	} catch (error) {
		status.setError(error.message);
	}
});

githubPullButton.addEventListener('click', async () => {
	try {
		saveSettings();
		if (rootPath !== rootInput.value.trim()) {
			const configured = await request('/bt/configure', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: rootInput.value })
			});
			rootPath = configured.root;
			rootInput.value = rootPath;
			saveSettings();
		}
		githubPullButton.disabled = true;
		const pull = async overwrite => request('/bt/github/pull', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: githubUrlInput.value,
				ref: githubRefInput.value,
				subdirectory: githubSubdirectoryInput.value,
				overwrite,
			}),
		});
		let data = await pull(false);
		if (!Array.isArray(data.conflicts)) {
			throw new Error('The server does not support file conflict checks. Restart Vizanti with the updated BT server.');
		}
		const conflicts = data.conflicts;
		if (conflicts.length > 0) {
			const overrideAll = window.confirm(
				`The pull found ${conflicts.length} existing XML file${conflicts.length === 1 ? '' : 's'}.\n\n` +
				'Choose OK to override all of them. Choose Cancel to decide for each file.'
			);
			if (overrideAll) {
				data = await pull(true);
			} else {
				const overwritePaths = [];
				for (const path of conflicts) {
					if (window.confirm(`Override existing file?\n\n${path}`)) overwritePaths.push(path);
				}
				if (overwritePaths.length > 0) data = await pull(overwritePaths);
			}
		}
		await loadFiles();
		status.setOK(`Pulled ${data.copied} XML file${data.copied === 1 ? '' : 's'}.`);
	} catch (error) {
		status.setError(error.message);
	} finally {
		githubPullButton.disabled = false;
	}
});

validateButton.addEventListener('click', async () => {
	try {
		await request('/bt/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editor.value }) });
		renderGraph(editor.value);
		status.setOK('XML is valid.');
	} catch (error) {
		status.setError(error.message);
	}
});

async function saveCurrentFile() {
	if (!selectedPath) return false;

	saveButton.disabled = true;
	saveStatus.textContent = 'Saving...';
	try {
		const data = await request(`/bt/file/${encodeURIComponent(selectedPath).replace(/%2F/g, '/')}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editor.value, revision })
		});
		revision = data.revision;
		savedContent = editor.value;
		updateTitle();
		try {
			renderGraph(editor.value);
		} catch (error) {
			graph.textContent = error.message;
		}
		status.setOK('Saved.');
		saveStatus.textContent = 'Saved';
		await loadFiles();
		return true;
	} catch (error) {
		status.setError(error.message);
		saveStatus.textContent = `Save failed: ${error.message}`;
		return false;
	} finally {
		updateRuntimeControls();
	}
}

async function startRuntime(mode) {
	if (!selectedPath) {
		status.setError('Select a behavior tree file before starting runtime.');
		return;
	}
	if (editor.value !== savedContent) {
		status.setError('Save the behavior tree before starting runtime.');
		return;
	}
	try {
		await request('/bt/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content: editor.value }),
		});
		renderGraphPreservingView(editor.value);
		setRuntimeMode(mode);
		status.setOK(`${mode === 'debug' ? 'Debug' : 'Runtime'} view ready.`);
	} catch (error) {
		status.setError(`Cannot start runtime: ${error.message}`);
	}
}

saveButton.addEventListener('click', async () => {
	await saveCurrentFile();
});
playButton.addEventListener('click', () => startRuntime('play'));
debugButton.addEventListener('click', () => startRuntime('debug'));
stopButton.addEventListener('click', () => {
	setRuntimeMode('');
	status.setOK('Returned to Editor.');
});

undoButton.addEventListener('click', () => {
	if (undoStack.length === 0) return;
	redoStack.push(editor.value);
	restoreDocumentState(undoStack.pop());
});

redoButton.addEventListener('click', () => {
	if (redoStack.length === 0) return;
	undoStack.push(editor.value);
	restoreDocumentState(redoStack.pop());
});

editor.addEventListener('input', () => {
	updateTitle();
	saveStatus.textContent = '';
	try { renderGraph(editor.value); } catch (error) { graph.textContent = error.message; }
});

textTabButton.addEventListener('click', () => selectTab('text'));
treeTabButton.addEventListener('click', () => selectTab('tree'));
nodeSearch.addEventListener('input', renderNodePalette);
fileList.addEventListener('change', () => {
	if (fileList.value) loadFile(fileList.value);
	else clearSelectedFile();
});
openButton.addEventListener('click', () => openModal('{uniqueID}_modal'));
newButton.addEventListener('click', () => showCreateDialog('file'));
newSubtreeButton.addEventListener('click', () => showCreateDialog('subtree'));
createCancel.addEventListener('click', closeCreateDialog);
createInput.addEventListener('keydown', event => {
	if (event.key === 'Enter') createConfirm.click();
});
createConfirm.addEventListener('click', async () => {
	const value = createInput.value.trim();
	try {
		if (createMode === 'file') {
			const data = await request('/bt/file', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: value })
			});
			await loadFiles();
			await loadFile(data.path);
			status.setOK(`${data.path} created.`);
		} else if (createMode === 'subtree') {
			if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) {
				throw new Error('IDs must start with a letter or underscore and use only letters, digits, dots, dashes, or underscores.');
			}
			const documentRoot = new DOMParser().parseFromString(editor.value, 'application/xml');
			if (documentRoot.querySelector('parsererror') || documentRoot.documentElement.tagName !== 'root') {
				throw new Error('The current XML must be valid before creating a subtree.');
			}
			const exists = Array.from(documentRoot.querySelectorAll('root > BehaviorTree[ID], root > BehaviorTree[id]')).some(tree => (tree.getAttribute('ID') || tree.getAttribute('id')) === value);
			if (exists) throw new Error(`A subtree named ${value} already exists.`);
			rememberDocumentState();
			const behaviorTree = documentRoot.createElement('BehaviorTree');
			behaviorTree.setAttribute('ID', value);
			behaviorTree.appendChild(documentRoot.createElement('Sequence'));
			documentRoot.documentElement.appendChild(behaviorTree);
			const declaration = editor.value.match(/^\s*(<\?xml[^>]*\?>\s*)/i)?.[1] || '';
			editor.value = `${declaration}${new XMLSerializer().serializeToString(documentRoot.documentElement)}`;
			renderInspector(null);
			updateTitle();
			renderGraph(editor.value);
			status.setOK(`${value} created.`);
		} else {
			return;
		}
		closeCreateDialog();
	} catch (error) {
		createStatus.textContent = error.message;
	}
});
deleteFileButton.addEventListener('click', () => {
	if (!selectedPath) return;
	deleteFileMessage.textContent = `Delete ${selectedPath}?`;
	openModal(deleteFileModal.id);
});
deleteFileCancel.addEventListener('click', () => closeModal(deleteFileModal.id));
deleteFileConfirm.addEventListener('click', async () => {
	if (!selectedPath) return;
	const path = selectedPath;
	try {
		await request(`/bt/file/${encodeURIComponent(path).replace(/%2F/g, '/')}`, { method: 'DELETE' });
		clearSelectedFile();
		closeModal(deleteFileModal.id);
		await loadFiles();
		status.setOK(`${path} deleted.`);
	} catch (error) {
		status.setError(error.message);
	}
});
maximizeButton.addEventListener('click', () => {
	setMaximized(!maximized);
	saveSettings();
});
componentsToggle.addEventListener('click', () => {
	setComponentsHidden(!componentsHidden);
	saveSettings();
});
componentsResize.addEventListener('mousedown', event => {
	if (componentsHidden) return;
	event.preventDefault();
	const workspaceBounds = workspace.getBoundingClientRect();
	function resize(moveEvent) {
		setComponentsWidth(moveEvent.clientX - workspaceBounds.left);
	}
	function stop() {
		document.removeEventListener('mousemove', resize, true);
		document.removeEventListener('mouseup', stop, true);
		saveSettings();
	}
	document.addEventListener('mousemove', resize, true);
	document.addEventListener('mouseup', stop, true);
});

['mousedown', 'mousemove', 'touchstart', 'touchmove', 'dragstart'].forEach(eventName => {
	panel.addEventListener(eventName, event => event.stopPropagation());
});
panel.addEventListener('wheel', event => {
	event.stopPropagation();
	if (!nodeList.contains(event.target)) event.preventDefault();
}, { passive: false });

function togglePanel() { panel.hidden = !panel.hidden; }

window.addEventListener('iconbar_height_change', syncPanelTop);
window.addEventListener('resize', syncPanelTop);
function startLongPress() {
	isLongPress = false;
	longPressTimer = setTimeout(() => {
		isLongPress = true;
		openModal('{uniqueID}_modal');
	}, 500);
}
function cancelLongPress() { clearTimeout(longPressTimer); }

icon.addEventListener('click', () => {
	if (isLongPress) { isLongPress = false; return; }
	togglePanel();
});
icon.addEventListener('mousedown', startLongPress);
icon.addEventListener('touchstart', startLongPress, { passive: true });
icon.addEventListener('mouseup', cancelLongPress);
icon.addEventListener('mouseleave', cancelLongPress);
icon.addEventListener('touchend', cancelLongPress);
icon.addEventListener('touchcancel', cancelLongPress);
icon.addEventListener('contextmenu', event => event.preventDefault());

resizeHandle.addEventListener('mousedown', event => {
	if (maximized) return;
	event.preventDefault();
	const startX = event.clientX;
	const startWidth = panel.getBoundingClientRect().width;
	function resize(moveEvent) {
		const width = Math.max(window.innerWidth / 3, Math.min(window.innerWidth * 0.85, startWidth + startX - moveEvent.clientX));
		panel.style.width = `${width}px`;
	}
	function stop() {
		document.removeEventListener('mousemove', resize, true);
		document.removeEventListener('mouseup', stop, true);
		saveSettings();
	}
	document.addEventListener('mousemove', resize, true);
	document.addEventListener('mouseup', stop, true);
});

syncPanelTop();
setMaximized(maximized);
setComponentsHidden(componentsHidden);
selectTab('tree');
await loadBundledNodeCatalog();
renderNodeCatalog(new DOMParser().parseFromString('<root/>', 'application/xml').documentElement);
updateHistoryButtons();
updateSubtreeAction();
updateRuntimeControls();
if (rootPath) loadFiles();
console.log('BT Manager Widget Loaded {uniqueID}');
