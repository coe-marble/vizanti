import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, element, spy } from './plugin_harness.mjs';

describe('rosbridge plugin interactions', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('rosbridge');
    });

    for (const [bridgeStatus, statusMethod, image] of [
        ['Reconnecting...', 'setError', 'reconnect'],
        ['Connecting...', 'setWarn', 'connect'],
        ['Connection lost.', 'setError', 'disconnect'],
        ['Failed to connect.', 'setError', 'disconnect'],
        ['Connected.', 'setOK', 'connect'],
    ]) {
        it(`renders ${bridgeStatus} with the expected status and icon`, function () {
            const status = { setError: spy(), setWarn: spy(), setOK: spy() };
            const icon = element(); const url = element(); const compression = element();
            const ctx = loadFunctions('rosbridge', ['update_gui'], {
                rosbridge: { status: bridgeStatus, url: 'localhost', port: 9090, compression: 'cbor' },
                status, icon, url, compression,
                img_reconnect: 'reconnect', img_connect: 'connect', img_disconnect: 'disconnect',
            });
            ctx.update_gui();
            assert.strictEqual(url.innerText, 'Bridge URL: ws://localhost:9090');
            assert.strictEqual(compression.innerText, 'Topic compression type: cbor');
            assert.strictEqual(icon.src, image);
            assert.deepStrictEqual(status[statusMethod].calls, [[bridgeStatus]]);
        });
    }
});
