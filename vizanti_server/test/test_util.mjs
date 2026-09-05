import assert from 'assert';

if (!String.prototype.replaceAll) {
	String.prototype.replaceAll = function (search, replacement) {
		return this.split(search).join(replacement);
	};
}

(async () => {
	const { groupStringsByPrefix } = await import('../public/js/modules/util.js');

	assert.deepEqual(groupStringsByPrefix([]), []);
	assert.deepEqual(groupStringsByPrefix(['alpha']), [['alpha']]);
	assert.deepEqual(
		groupStringsByPrefix(['robot/base_link', 'robot/base_footprint']),
		[['robot', 'robot/base_link', 'robot/base_footprint']]
	);
	assert.deepEqual(
		groupStringsByPrefix(['zeta', 'alpha', 'beta']),
		[['alpha'], ['beta'], ['zeta']]
	);
	assert.deepEqual(
		groupStringsByPrefix(['auv_01', 'auv-02', 'surface']),
		[['auv', 'auv_01', 'auv-02'], ['surface']]
	);
	console.log('utility tests passed');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
