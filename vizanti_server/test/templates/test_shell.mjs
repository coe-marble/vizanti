import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { element, environment, loadFunctions, plain, spy } from './plugin_harness.mjs';

describe('shell plugin interactions', function () {
	it('preserves required template assets and placeholders', function () {
		runTemplateContract('shell');
	});

	it('runs a command through its persistent server session', async function () {
		const serverApi = {
			executeCommand: spy(async () => ({
				success: true, exitCode: 0, stdout: 'done', stderr: '',
			})),
		};
		const commandInput = element('echo done');
		const runButton = element();
		const statusText = element();
		const output = element('Ready.');
		const ctx = loadFunctions('shell', ['runCommand', 'finishCommand'], environment({
			serverApi, commandInput, runButton, statusText, output,
			sessionId: 'shell_autoID_1', running: false, lastCompletion: null,
			outputPollTimer: null,
			setRunning: spy(), setStatus: spy(), appendOutput: spy(), addHistory: spy(),
			saveSettings: spy(),
		}));
		await ctx.runCommand();
		assert.deepStrictEqual(plain(serverApi.executeCommand.calls), [[{
			sessionId: 'shell_autoID_1', command: 'echo done', timeoutSeconds: null,
			background: false, persistent: true,
		}]]);
		assert.deepStrictEqual(plain(ctx.setStatus.calls), [
			['Running — Ctrl+C stops it.'], ['Exit 0'],
		]);
		assert.deepStrictEqual(plain(ctx.appendOutput.calls), [
			['$ echo done\n'], ['done\n'],
		]);
	});
});
