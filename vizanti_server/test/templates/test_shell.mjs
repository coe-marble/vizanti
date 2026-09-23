import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { element, environment, loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('shell plugin interactions', function () {
	it('preserves required template assets and placeholders', function () {
		runTemplateContract('shell');
	});

	it('runs a bounded command through the server API', async function () {
		const serverApi = {
			executeCommand: spy(async () => ({
				success: true, exitCode: 0, stdout: 'done', stderr: '',
			})),
		};
		const commandInput = element('echo done');
		const timeoutInput = element('10');
		const backgroundInput = element();
		const runButton = element();
		const statusText = element();
		const output = element();
		const ctx = loadFunctions('shell', ['runCommand'], environment({
			serverApi, commandInput, timeoutInput, backgroundInput, runButton, statusText, output,
			saveSettings: spy(),
		}));
		await ctx.runCommand();
		assert.deepStrictEqual(plain(serverApi.executeCommand.calls), [[{
			command: 'echo done', timeoutSeconds: 10, background: false,
		}]]);
		assert.strictEqual(statusText.textContent, 'Completed with exit code 0.');
		assert.strictEqual(output.textContent, 'done');
		assert.strictEqual(runButton.disabled, false);
	});
});
