# Library Folio

The manuscript is the center of ThesisDesk. Navigation and research assistance are supporting surfaces.

## Visual system

Warm paper, charcoal text and a restrained oxblood accent. Source Serif 4 gives the writing surface an editorial rhythm; IBM Plex Sans keeps navigation concise. Fonts ship locally through Fontsource packages. Color, typography, spacing, radius and elevation tokens live in frontend/styles/tokens.css.

Light and dark palettes are independently defined. AI proposals will have labels and diff semantics, not color alone. No chat bubbles, decorative gradients or sparkle language.

## Foundation interactions

- Left: outline, sources and notes views; project creation and selection.
- Center: read-only manuscript preview; focus mode; clear editor/export availability.
- Right: collapsible assistant, adjustable with pointer or left/right keys on its separator.
- Ctrl/Cmd+K: searchable workspace actions, Tab navigation, Enter selection, Escape dismissal.
- Radix dialogs provide focus trapping, accessible names and focus restoration.
- Theme preference persists locally; preview manuscript/project data does not.
- Tablet uses a navigation overlay. Mobile defaults to reading with explicit panel switching.
- Preview copy never claims a save, uploaded file, generated answer or live inference.

## States

The foundation handles missing configuration, disabled auth, malformed callback, server load error, pending form submission, empty project, temporary preview project, offline banner and unavailable future actions. Later milestones replace availability messages with real editor/source/assistant flows.

## Remaining design verification

Automated browser tests and screenshot review cover desktop, mobile and dark mode. A full WCAG AA audit, editor keyboard behavior, assistive-technology testing and large-manuscript performance are required before MVP completion.
