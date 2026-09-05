import assert from 'assert';
import { runTemplateContract } from './template_test_helpers.mjs';
import { loadFunctions, environment, element, spy, plain, subscriptionCases } from './plugin_harness.mjs';

describe('posewithcovariancestamped plugin', function () {
    it('preserves required template assets and placeholders', function () {
        runTemplateContract('posewithcovariancestamped');
    });

    subscriptionCases('posewithcovariancestamped', 'marker_topic', 'geometry_msgs/msg/PoseWithCovarianceStamped', () => ({
        typedict: { '/test': 'geometry_msgs/msg/PoseWithCovarianceStamped' }, icon: element(), icon_pose: 'pose', icon_pose_with_covariance: 'covariance',
    }));
    it('computes eigenvalues and axis vectors for diagonal covariance', function () {
        const covariance = Array(36).fill(0); covariance[0] = 9; covariance[7] = 4;
        const result = loadFunctions('posewithcovariancestamped', ['calculateEigen']).calculateEigen(covariance);
        assert.deepStrictEqual(plain(result), { lambda1: 9, lambda2: 4, eigenvector1: [1, 0], eigenvector2: [0, 1] });
    });
    it('normalizes eigenvectors for correlated covariance', function () {
        const covariance = Array(36).fill(0); covariance[0] = 2; covariance[7] = 2; covariance[1] = covariance[6] = 1;
        const r = loadFunctions('posewithcovariancestamped', ['calculateEigen']).calculateEigen(covariance);
        assert.strictEqual(r.lambda1, 3); assert.strictEqual(r.lambda2, 1);
        assert.ok(Math.abs(Math.hypot(...r.eigenvector1) - 1) < 1e-12);
        assert.ok(Math.abs(r.eigenvector1[0] * r.eigenvector2[0] + r.eigenvector1[1] * r.eigenvector2[1]) < 1e-12);
    });
    it('handles zero covariance without NaN eigenvalues', function () {
        const r = loadFunctions('posewithcovariancestamped', ['calculateEigen']).calculateEigen(Array(36).fill(0));
        assert.strictEqual(r.lambda1, 0); assert.strictEqual(r.lambda2, 0);
    });

});
