# Exhaustive watch-source inventory

Load this reference only when the requested scope includes one or more `watch_sources`.

List every file under each watched path at the resolved current upstream head:

```bash
git -C <checkout> ls-tree -r --name-only <current_head> -- <watch paths...>
```

Compare that inventory against all registered upstream refs for the same repository. The targeted registry extractor includes this supporting subset for a named watch source; an all-sources run already has the complete registry.

For every requested watch scope:

- List every uncovered upstream artifact path, not only notable examples.
- Group long inventories by category or directory, but never replace the complete list with “such as,” “etc.,” or similar shorthand.
- For an initial baseline, call findings `currently uncovered`, not `new`, unless commit history establishes when an asset appeared.
- For later checkpoints, distinguish `new`, `moved`, `removed`, and `still uncovered` paths when the accepted baseline supports that distinction.
- Use a nested list or collapsible Markdown section when needed; compactness must not remove paths.

A watch finding asks whether to create/update a local artifact entry, explicitly ignore coverage, or keep watching. It never assumes adoption and never triggers automatic upstream implementation.
