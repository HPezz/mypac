# Multi-commit implementation request

Complete issue #9001 in exactly two commits:

1. Change only `task-a.txt` from `pending` to `complete`, verify it, and create an intermediate commit with `Refs #9001`.
2. Then change only `task-b.txt` from `pending` to `complete`, verify it, and create the completing commit with `Closes #9001`.

Do not combine the two slices. Together they fully resolve the issue.
