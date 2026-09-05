import {
	runTemplateDomContract,
	runTemplatePersistenceContract,
} from './template_test_helpers.mjs';

const plugins = [
	'add', 'altimeter', 'area', 'battery', 'btmanager', 'button',
	'compressedimage', 'folder', 'grid', 'gridcells', 'initialpose',
	'inspector', 'map', 'markerarray', 'navball', 'nodemgr', 'odom',
	'path', 'pointcloud', 'posearray', 'posewithcovariancestamped',
	'range', 'reconfigure', 'robotmodel', 'rosbag', 'rosbridge',
	'satelite', 'scan', 'settings', 'simplegoal', 'speedometer',
	'survey', 'teleop', 'temperature', 'tf', 'waypoints',
];

describe('template redesign contracts', function () {
	for (const plugin of plugins) {
		it(`${plugin} supplies every script-referenced template element`, function () {
			runTemplateDomContract(plugin);
		});

		it(`${plugin} preserves its settings persistence contract`, function () {
			runTemplatePersistenceContract(plugin);
		});
	}
});
