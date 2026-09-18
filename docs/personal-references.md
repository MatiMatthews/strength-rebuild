# Personal strength references

New personal settings start with unknown strength references. In Settings, each reference can be marked known or “No lo sé”. Known values accept a decimal comma or point; pull-up capacity is a positive whole repetition count. Incomplete or invalid input stays editable, and cancel restores the saved draft without writing.

Reference values carry their own kg/lb unit and user/unknown provenance. Existing settings retain their original values and marker on read; a legacy marker does not select a demo or move data. The first subsequent save pins an older profile's existing unit. Changing display units converts references only at the prescription boundary, never by reinterpreting stored numbers.

Only the existing exercise-specific strength policy derives a load from a matching known reference. Unknown or unmatched references keep “Carga por definir”; no fallback load is fabricated. Saving settings changes future previews, while existing plans and workout history retain their original snapshots.

Regression coverage includes real Settings and Plan routes, independent SQLite readback, cold reopening, partial and unknown profiles, legacy preservation, invalid input, cancellation, save failures, and concurrent edit rejection. The schedule/increment journey enters its synthetic reference explicitly rather than relying on personal defaults.
