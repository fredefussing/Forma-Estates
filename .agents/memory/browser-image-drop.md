---
name: Browser image drop compatibility
description: Cross-browser rules for reliable local image drag-and-drop in dashboard upload zones.
---

Do not require `DataTransfer.types` to contain the exact string `Files` before preventing the drag default. On drop, read both `DataTransfer.files` and file-kind `DataTransfer.items`, and recognize common image extensions when the browser supplies an empty MIME type.

**Why:** Browser and iframe combinations can deliver valid local image drops without the expected type marker or MIME value, making a visibly active upload zone silently reject the file.

**How to apply:** Use `preventDefault()` on file drop zones unconditionally, set the drop effect to copy, keep drag-leave state stable across child elements, and apply the MIME-plus-extension check to every multi-image uploader. If upload tiles also support internal drag-to-reorder, handle file drops in the capture phase before the child reorder handler.