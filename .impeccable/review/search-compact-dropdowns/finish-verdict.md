## verdict

- Resolved — native classification-label focus. Opened the authoritative `mobile-focus.jpg` (390×844); it is a valid viewport capture showing the native Nhóm sách field with a contiguous wine bottom boundary and its label visibly wine. Reviewed the exact Search CSS correction: the nested focus selector now includes both `input[role="combobox"]` and `select`, preserving desktop behavior while reaching the wrapped native field. Parent-reported settled runtime values corroborate label/border `rgb(92,2,2)`, inset bottom stroke,44px field and170ms duration. Build/format PASS are parent-reported. This is the single scored correction; no browser, detector or full audit was rerun by this reviewer.
- No material regression observed in the correction's selector or focused narrow capture. The original seven nonfocused captures are unchanged.

## remaining

Clear for this scored native-label correction. This ship verdict covers the scored correction, not a new whole-surface audit. The original scoped finish review and its platform/runtime limitations remain applicable.

disposition: ship
