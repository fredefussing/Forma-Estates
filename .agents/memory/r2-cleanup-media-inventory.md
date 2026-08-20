---
name: R2 cleanup media inventory
description: Durable-media tables must be added to both R2 reconciliation and orphan cleanup inventories.
---

Whenever a feature persists an R2-backed `/uploads/` URL or a raw R2 object
key in a new database table, add its references to both the admin
media-reconciliation inventory and the admin orphan-cleanup live-key inventory.

**Why:** The cleanup endpoint treats an object as safe to delete when no
registered database inventory references it. A new durable-media table omitted
from that inventory can make valid customer files look orphaned and disappear
later, even though their project record still points to them.

**How to apply:** Treat the persistence model and media-maintenance routes as
one change. Include direct object keys as well as `/uploads/` URLs and JSON
media arrays, then run a dry-run or regression fixture confirming every
referenced key is protected before enabling cleanup.