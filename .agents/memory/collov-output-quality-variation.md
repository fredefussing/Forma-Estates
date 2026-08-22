---
name: Collov output-quality variation
description: How to distinguish Collov generation variation from the durable image-delivery pipeline.
---

The historic sharp reference was delivered directly from Collov's CDN, while current standard
generations are first saved as a byte-identical raw provider source for future refinements and
then passed through a separate delivery encoding for durable R2 storage.

**Why:** The two images therefore do not have equivalent post-processing. A visual comparison
alone cannot prove that a particular Sharp or JPEG setting caused a quality regression. One
tested source and delivery pair may also be a different Collov generation rather than the same
image as the historic reference.

**How to apply:** For a reported regression, keep the input, room, style, tier, and prompt fixed;
then compare the raw provider response and its exact durable delivery. Only change delivery
settings after that controlled test demonstrates a repeatable difference. Preserve the raw source
for refinements so a customer-facing delivery is never used as the next model input.

On 2026-08-22, a controlled comparison confirmed that an under-specified Agent request can
produce a softer raw provider image before delivery processing happens. A detailed prompt on the
same input increased visible material texture without any upscaling or extra model call.

**Why:** The historic sharp Standard reference used the locked structural contract plus a detailed
room/style/material brief, while the short Agent request had bypassed that context. The current
delivery transform did not resize the provider image and a current detailed-prompt result remained
sharp after the durable pipeline.

**How to apply:** The user approved the concise, direct room/style prompt output as the visual
quality benchmark for initial Standard and Agent generations. Do not reintroduce the long
structural-preservation contract into those two initial flows: the accepted tradeoff is more model
freedom (including items such as shelving or pendants) in exchange for the preferred sharp,
material-rich staging result. Keep Agent requests concise while naming the desired micro-details.
Treat raw-provider softness as a prompt or provider-output issue first; do not add an upscaler or
remove durable delivery processing without a same-input, same-prompt raw-versus-delivery test.

A same-day Standard check also produced one highly detailed kitchen raw output and one noticeably
smoother living-room raw output, while the durable delivery step increased edge energy in both.

**Why:** A current result can match or exceed historic detail in one scene and fall below it in
another even though both use the same locked Standard contract and identical transport/delivery
code. A separate rerender of the living-room source recovered more texture, which is consistent
with content-dependent or stochastic provider variation rather than a universal pipeline fault.

**How to apply:** Evaluate quality per raw provider output and across more than one room type. Do
not infer a global regression from a single smooth scene, and do not use delivery sharpness metrics
as evidence that missing material texture was present before delivery processing.
