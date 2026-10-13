## verdict

1. **Resolved — [P2] Synchronize the stamp/departure clock.** `apps/user-web/src/layouts/AuthLayout.tsx:185` now mounts the real success stamp hidden with its CSS animation disabled. `apps/user-web/src/components/auth/PaperStormLayout.tsx:83–85,100–106` starts that DOM stamp only when the selected native fallback starts; the WebGL path keeps the DOM stamp hidden and owns its complete 280 ms stamp clock. The no-WAAPI path reveals the stamp as its technical fallback starts. This removes the early visible stamp and subsequent reset identified in the full review, while retaining the authored 280 + 1152 ms sequence and outside-paper schedule.

The delayed SVG decode tests at `apps/user-web/tests/auth-auction-arrival.mjs:208–248` explicitly exercise preparation before and after the renderer timeout, check that the real stamp stays hidden during preparation, verify the selected renderer's visibility state, and reject late WebGL resurrection after fallback selection. The updated runtime records PASS for both cases at desktop and mobile widths, with navigation/focus/inertness/scroll cleanup and no page errors. Source review and these assertions support the asynchronous timing correction; still images alone would not prove it.

All twelve recaptured Auth PNGs were opened again at the same paths: desktop/mobile/user-465 stamp, flight, lingering and usable-filter views. They remain valid and visibly retain the stamped intact papers, tiny fragments, destination composition and lingering particles. The unchanged auction captures retain their earlier valid evidence. The three video files and updated video-runtime remain supplied evidence; the videos were not played in this file-based pass. No regression introduced by this bounded stamp patch is visible in the recaptures or the reviewed changed source. No new defect hunt, detector pass or product edit was performed.

## remaining

Clear for the one scored material fix. This ship verdict covers that fix, not a new whole-surface audit. Production documentation and human review remain the separate handoff work already identified in the full review; fixture Chromium checks do not establish real API, native or Safari acceptance.

disposition: ship
