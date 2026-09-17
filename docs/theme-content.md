# Athlete content themes

Native and web theme hooks share the Athlete tokens. The compatibility token
entrypoint re-exports those same colors; it does not define a second palette.
Barlow typography, Lucide icons and chartreuse/ink/paper surfaces remain in use.

Static content uses `theme.text`, `theme.textMuted`, or the semantic text colors
on theme surfaces. Notices keep an explicit pale background and matching dark
semantic foreground in either theme. Fixed ink is appropriate on explicit paper
or chartreuse bands, but not on a theme-dependent surface.

The rendered-component tests cover both token consumers, all notice tones, tags,
and text on each theme surface. Browser journeys measure computed text/icon
contrast in settings, Today, Plan, history, workout, finish review, readiness and
weekly review. Settings journeys also reject invalid input without writes and
verify a saved preference through independent SQLite readback after reopening.
Theme changes preserve focus and unsaved input. Settings are also inspected at
increased magnification. Native verification uses the embedded certification
build on a synthetic emulator, including system theme and font-scale changes.

Interactive-state contrast and structural/typographic consolidation are separate
acceptance work. This static-content coverage does not certify those states or
replace final physical-device acceptance.
