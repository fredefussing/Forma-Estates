---
name: Mockup sandbox isolation
description: Keep Vite component-preview sandboxes independent of main-app tooling.
---

The mockup sandbox should not load the main app's Tailwind configuration through optional workspace-inspection tooling.

**Why:** The sandbox has its own dependency tree. When the inspection plugin imports the workspace Tailwind config, package resolution can fail on a dependency that is irrelevant to the prototype, leaving an error overlay on otherwise-renderable mockups.

**How to apply:** If an isolated mockup preview reports a main-workspace Tailwind import failure, remove or disable the sandbox-only inspection/cartographer plugin instead of changing the live app's dependencies. Keep the preview plugin, React, and Tailwind Vite plugin intact.