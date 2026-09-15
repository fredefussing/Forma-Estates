---
name: Large-monitor generator layouts
description: User requirement for how authenticated production workspaces should behave on large external monitors.
---

Authenticated generation workspaces should expand to the full available content width at viewport widths of 1440px and above. Do not apply this rule to dialogs, narrow text blocks, or controls whose usability depends on a readable maximum width.

**Why:** The user works on a large external work monitor and explicitly reported that generation interfaces looked constrained and failed to use the screen.

**How to apply:** New or revised image, floorplan, and video generation workspaces should remain capped on ordinary screens but remove the outer workspace cap at the large-monitor breakpoint. Preserve sensible inner widths for forms, copy, and modals.