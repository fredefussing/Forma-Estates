---
name: Acrobat review links
description: How to inspect comments on a public Adobe Acrobat review link.
---

For public Acrobat review links, do not infer that the downloaded PDF contains the review comments. The PDF can be image-only while the comments are stored separately and rendered in the browser's Comments panel; a generic markdown fetch can omit them.

**Why:** A shared site-review PDF displayed dozens of comments in Acrobat, but its downloaded PDF had no extractable text or embedded annotations and the markdown fetch exposed only viewer chrome.

**How to apply:** Inspect the browser-rendered comment panel and its page groups, as well as the PDF pages, before summarizing requested revisions.

For ambiguous comments, match the visible annotation marker to the UI in the page image at its original screenshot resolution. A DOM element sharing a comment ID may belong to the side panel rather than the page marker; its screen coordinates can point to the wrong place. Crop the page capture around the marker instead of interpreting a downscaled full-page screenshot.