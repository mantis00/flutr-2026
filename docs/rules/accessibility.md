# Accessibility Requirements

Flutr must meet **WCAG 2.1 AA** compliance for all interfaces (public and admin).

## Mandatory Practices

- Use semantic HTML elements (`nav`, `main`, `section`, `article`, `header`, `footer`)
- All interactive elements must be keyboard-accessible (Tab, Enter, Escape, Arrow keys)
- All images must have meaningful `alt` text (or `alt=""` for decorative images)
- Form inputs must have associated `<label>` elements or `aria-label`
- Color contrast must meet AA minimum (4.5:1 for normal text, 3:1 for large text)
- Focus indicators must be visible on all interactive elements
- Error messages must be associated with their form fields via `aria-describedby`
- `CardTitle` renders an `<h2>`; pass `asChild` with your own heading where a card title is the page's `<h1>` or needs another level

## ARIA Guidelines

- Prefer native HTML semantics over ARIA roles when possible
- Use `aria-live` regions for dynamic content updates
- Use `aria-expanded`, `aria-controls`, `aria-haspopup` for interactive widgets
- Never use `aria-hidden="true"` on focusable elements

## Testing

- Test with keyboard-only navigation
- Verify screen reader announcements for dynamic content
- Check color contrast ratios for all text/background combinations

## Known Checker Findings (IBM Equal Access)

Scan reports are kept locally in `/accessibility/` (git-ignored, not in the repo). These findings recur on every scan and are intentional — verify before "fixing" one:

- **`aria_hidden_nontabbable`** — Radix marks the page behind an open dialog `aria-hidden` while its focus scope traps focus, so the flagged controls are unreachable. Also covers `react-focus-guards`' own `tabindex="0"` spans. Scan with no dialog open to avoid it.
- **`aria_role_redundant` on `<ul role="list">`** — Tailwind preflight strips `list-style`, which makes WebKit drop list semantics. The role stays.
- **`input_label_visible`** — icon-only buttons named by `aria-label`, and inputs whose `<label>` is `sr-only`. Both are deliberate.
- **`style_focus_visible` / `widget_tabbable_single` / `element_tabbable_role_valid` on Radix roots** — `RovingFocusGroup` keeps `tabindex="0"` on its container until it forwards focus to an item, so the DOM momentarily shows two tab stops where there is one. Do **not** "fix" it with `rovingFocus={false}`: a `type="single"` `ToggleGroupItem` is `role="radio"`, and without roving focus every radio becomes its own tab stop and the arrow keys stop working.
- **`aria_id_unique` on a closed Radix trigger** (IBM maps it to SC 4.1.2, level A) — Radix points `aria-controls` at content it unmounts, so the reference dangles while closed. Handled in `dialog`, `sheet`, `alert-dialog`, `popover`, `select`, `tabs` and `accordion`: each drops the attribute while its target is unmounted and keeps it while mounted, which is what Radix itself does in `react-dropdown-menu`. `aria-controls` is only required for `scrollbar` and an expanded `combobox`, and `select` is the one that keeps it whenever it applies. Do not reach for `forceMount` to keep the reference valid: it pins `isOpen`/`present` true, so the panel never collapses. `collapsible.tsx` still carries the bug — it has no call site in the app.
- **`aria_region_labelled`, `element_id_unique` on `recharts-*`** — Recharts internals.
- **`a_target_warning`** — external links already say "(opens in new tab)" in their `aria-label`.
- **A tabbable `table-container`** — `Table` sets `tabIndex={0}` on its `overflow-x-auto` wrapper so keyboard users can scroll clipped columns (axe `scrollable-region-focusable`, WCAG 2.1.1). It is deliberately unnamed: a name requires a role, and a `role="region"`/`"group"` needs one at every call site.
