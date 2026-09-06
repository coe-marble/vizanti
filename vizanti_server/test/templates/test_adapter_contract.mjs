import assert from 'assert';
import { ADAPTER_OPERATION, ENDPOINT_TYPE, assertAdapterContract } from '../../public/js/modules/adapters/contract.js';

describe('adapter contract', function () {
	it('defines the common endpoint operations', function () {
		assert.deepEqual(ADAPTER_OPERATION, {
			CONFIGURATION_FIELDS: 'configurationFields', ENDPOINT_FIELDS: 'endpointFields', SUPPORTS: 'supports', ALLOWS_DISCOVERY: 'allowsDiscovery', GET_TF: 'getTf', SUBSCRIBE: 'subscribe', PUBLISH: 'publish', CALL: 'call', LIST_ENDPOINTS: 'listEndpoints', CREATE_MANUAL_ENDPOINT: 'createManualEndpoint', LIST_OUTPUT_MESSAGES: 'listOutputMessages', RESTORE_ENDPOINT: 'restoreEndpoint',
		});
		assert.deepEqual(ENDPOINT_TYPE, { TOPIC: 'topic', SERVICE: 'service' });
	});

	it('accepts an adapter that implements every operation', function () {
		const adapter = assertAdapterContract({
			id: 'example', configurationFields() {}, endpointFields() {}, supports() {}, allowsDiscovery() {}, getTf() {}, listOutputMessages() {}, listEndpoints() {}, createManualEndpoint() {}, restoreEndpoint() {}, subscribe() {}, publish() {}, call() {},
		});
		assert(Object.isFrozen(adapter));
	});

	it('rejects incomplete adapters', function () {
		assert.throws(() => assertAdapterContract({ id: 'partial', subscribe() {} }), TypeError);
	});
});
