---
name: Collov refinement fidelity
description: How to keep repeated Collov image adjustments sharp without changing user-requested content.
---

The unmodified, durable Collov provider result is both the customer-facing preview and the master for every subsequent adjustment. Branding, the visible localized AI-edited badge, invisible watermarking, metadata, and any required re-encoding belong only on the final downloaded/exported copy. Every refinement must also receive the server-controlled precision refinement prompt, which locks the camera, unrequested details, and image fidelity while still permitting the requested change.

**Why:** The user confirmed this exact setup works: the clean raw Collov image is the visual quality target. Preprocessing the preview makes it harsher and prevents the in-app result from matching the provider output; reusing a processed delivery also compounds losses across adjustments. Compliance still belongs on the copy that leaves the editor.

**How to apply:** Persist the provider bytes unchanged and durably before returning success; use that same raw URL for preview and the next refinement. Apply final-download processing exactly once for JPG, PNG, and PDF, and fail visibly instead of falling back to a raw download. Final JPEG export must use quality 100 with 4:4:4 chroma so the optional badge/compliance pass does not visibly reduce the accepted Collov quality. Keep the raw master in media reconciliation and orphan-cleanup inventories. Do not substitute the original before-photo for later refinements, because doing so discards earlier accepted edits.