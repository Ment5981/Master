# Master Android Test Cases

Run these cases on an emulator and one physical Android device after every
meaningful Android change.

## Core persistence

1. Install and open the app.
2. Create or edit the current goal.
3. Add one child node and one task linked to that node.
4. Complete the task and confirm the map progress changes.
5. Force-close the app and relaunch it.
6. Confirm the goal, node, task, completion status and progress are unchanged.

## Canvas

1. Drag the canvas background.
2. Pinch zoom in and out.
3. Drag a node to a new position.
4. Expand and collapse a multi-level branch.
5. Use fit-to-content and return-to-center.
6. Relaunch and confirm the manual node position remains.

## Planning

1. Create a task in Today.
2. Confirm it appears in Week and Calendar.
3. Move its planned date from Calendar.
4. Confirm Today, Week and Month update consistently.

## Failure paths

1. Disable network before saving a changed task.
2. Confirm the UI shows an error or pending state instead of success.
3. Restore network and retry.
4. Confirm no duplicate or silent data loss.

## Evidence format

Record each case as `PASS`, `FAIL` or `BLOCKED` with device model, Android
version, app version, timestamp and a screenshot or screen recording.
