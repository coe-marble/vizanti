# Behavior-tree runtime integration

- [x] Validate and bundle the selected root XML plus only its local, transitive
  includes; send the server-calculated SHA-256 values to `DeployBehaviorTree`.
- [x] Make Vizanti Play/Debug deploy the selected root XML bundle and start or
  cancel `RunBehaviorTree` goals through the ROS 2 action endpoints.
- [x] Render action feedback as a live runtime-state list and display the
  terminal action result.
- [ ] Expand the approved vehicle namespace substitution before deployment.
- [ ] Publish one-time node metadata with a deployment so Vizanti can map stable
  node UIDs to its rendered editor nodes without repeating metadata in feedback.
- [x] Publish a final feedback snapshot from the navigator before returning the
  action result.
- [x] Publish a retained execution-state topic from the navigator and consume it
  in Vizanti alongside action feedback.
- [ ] Register and build every custom BT node required by the mission, including
  `AsyncSequenceAnySuccess`, `AsyncPair`, `SetBtState`, comparison nodes, and
  target-rejection support.
- [ ] Configure the custom BT plugin libraries and the
  `bt_navigator_run_behavior_tree_rclcpp_node` private parameters for Jetski.
- [ ] Fix the malformed mission XML and replace or resolve launch substitutions
  before deployment.
- [ ] Add authorized integration tests for deployment, action cancellation, and
  feedback-to-UI mapping.
