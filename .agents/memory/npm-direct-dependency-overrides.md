---
name: NPM direct dependency overrides
description: How to keep a direct package and its transitive copies on one version without EOVERRIDE failures.
---

When a package is both a direct dependency and listed in `overrides`, set the
override value to `$packageName` rather than repeating a version string.

**Why:** NPM can reject an install with `EOVERRIDE` even when the independently
written direct and override versions resolve to the same release. Referencing
the direct declaration makes that relationship explicit and keeps transitive
copies aligned.

**How to apply:** Update the direct dependency to the desired compatible
version, use `$packageName` in `overrides`, and then let package management
regenerate the lockfile. Do not bypass this with forced installation.