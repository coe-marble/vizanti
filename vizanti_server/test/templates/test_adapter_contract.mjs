import assert from 'assert';
import { ADAPTER_OPERATION, ENDPOINT_TYPE, assertAdapterContract } from '../../public/js/modules/adapters/contract.js';

describe('adapter contract', function () {
	it('defines the common endpoint operations', function () {
		assert.deepEqual(ADAPTER_OPERATION, {
			CONFIGURATION_FIELDS: 'configurationFields', ENDPOINT_FIELDS: 'endpointFields', SUPPORTS: 'supports', ALLOWS_DISCOVERY: 'allowsDiscovery', DISCOVER_ENDPOINTS: 'discoverEndpoints', SUBSCRIBE_RAW: 'subscribeRaw', GET_TOPIC_INFO: 'getTopicInfo', GET_TF: 'getTf', SUBSCRIBE: 'subscribe', PUBLISH: 'publish', CALL: 'call', CREATE_MANUAL_ENDPOINT: 'createManualEndpoint', LIST_OUTPUT_MESSAGES: 'listOutputMessages', RESTORE_ENDPOINT: 'restoreEndpoint', LIST_NODES: 'listNodes', GET_NODE_PARAMETERS: 'getNodeParameters', SET_NODE_PARAMETER: 'setNodeParameter', RECORDING_STATUS: 'recordingStatus', SET_RECORDING: 'setRecording', COMMAND_SHORTCUTS: 'commandShortcuts',
		});
		assert.deepEqual(ENDPOINT_TYPE, { TOPIC: 'topic', SERVICE: 'service' });
	});

	it('accepts an adapter that implements every operation', function () {
		const adapter = assertAdapterContract({
			id: 'example', configurationFields() {}, endpointFields() {}, supports() {}, allowsDiscovery() {}, discoverEndpoints() {}, subscribeRaw() {}, getTopicInfo() {}, getTf() {}, listOutputMessages() {}, createManualEndpoint() {}, restoreEndpoint() {}, subscribe() {}, publish() {}, call() {}, listNodes() {}, getNodeParameters() {}, setNodeParameter() {}, recordingStatus() {}, setRecording() {}, commandShortcuts() {},
		});
		assert(Object.isFrozen(adapter));
	});

	it('rejects incomplete adapters', function () {
		assert.throws(() => assertAdapterContract({ id: 'partial', subscribe() {} }), TypeError);
	});
});
