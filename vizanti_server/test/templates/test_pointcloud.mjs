import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('pointcloud plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('pointcloud');
    });

    subscriptionCases('pointcloud', 'range_topic', 'sensor_msgs/msg/PointCloud2');
    for (const [type, setter, value] of [[1, 'setInt8', -12], [2, 'setUint8', 250], [3, 'setInt16', -1234], [5, 'setInt32', -123456], [7, 'setFloat32', 1.25], [8, 'setFloat64', -2.5]]) {
        for (const littleEndian of [true, false]) {
            it(`decodes datatype ${type} with littleEndian=${littleEndian} at a nonzero offset`, function () {
                const view = new DataView(new ArrayBuffer(16));
                view[setter](2, value, littleEndian);
                const ctx = loadFunctions('pointcloud', ['bytes_to_datatype']);
                assert.strictEqual(ctx.bytes_to_datatype(view, 2, type, littleEndian), value);
            });
        }
    }
    it('returns zero for unsupported datatypes', function () {
        assert.strictEqual(loadFunctions('pointcloud', ['bytes_to_datatype']).bytes_to_datatype(new DataView(new ArrayBuffer(1)), 0, 99, true), 0);
    });
    it('returns no colour groups for an empty cloud', function () {
        assert.deepStrictEqual(plain(loadFunctions('pointcloud', ['histogramCut']).histogramCut([], 4)), []);
    });
    it('groups identical colours together without dropping points', function () {
        const points = [{ r: 10, g: 20, b: 30, x: 1 }, { r: 10, g: 20, b: 30, x: 2 }];
        const groups = loadFunctions('pointcloud', ['histogramCut']).histogramCut(points, 4);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].color, '#0a141e');
        assert.deepStrictEqual(plain(groups[0].points), points);
    });
    it('retains points at both colour range endpoints', function () {
        const points = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }];
        const groups = loadFunctions('pointcloud', ['histogramCut']).histogramCut(points, 2);
        assert.deepStrictEqual(plain(groups.map(g => g.color)), ['#000000', '#ff0000']);
        assert.strictEqual(groups.reduce((n, g) => n + g.points.length, 0), 2);
    });

});
