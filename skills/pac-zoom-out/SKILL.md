---
name: pac-zoom-out
description: "Zoom out from an unfamiliar code area and map how it fits into the bigger picture. Use when the user says to zoom out, go up a layer, map an area, or asks how code fits together."
license: MIT
compatibility: Pi coding agent
metadata:
  author: mypac
  stage: shared
---

# Zoom out

Go up one layer of abstraction. Map the relevant modules and callers, using the project's domain vocabulary. Treat `CONTEXT.md` as the source of truth when present, and fall back to nearby docs or code names otherwise.

Resolve the area from the user's request or conversation. Read only the minimum context needed. Cover the area, big picture, modules, callers or entry points, flow, and useful next reads. Do not propose implementation changes unless the user asks.
