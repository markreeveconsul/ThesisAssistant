# Thesa: approved source design adaptation

## Direction

Approved by the user after reviewing the six-page thesis-workspace-wireframe.pdf. The later approved thesa-ui source refines this into Thesa: emerald accents, rounded cards, Manrope interface typography, Source Serif 4 manuscripts and Otto illustrations. The login uses a split form/illustration layout. Dark mode is separately tuned. Tokens live in frontend/styles/tokens.css; the adaptation layer lives in frontend/styles/thesa.css. Original prototype sample citations, percentages and fake messages are not used. Existing browser storage keys retain the thesisdesk prefix so drafts survive the rename. Otto motion respects reduced-motion preferences.

## Screen structure

1. Account access: existing email/password flows; Google login awaits provider setup.
2. Dashboard: new thesis form with working title, research problem, citation style and five-chapter/blank structure; recent thesis cards without invented completion percentages.
3. Workspace: chapters and sources share the left pane; a wide manuscript is centered beneath the formatting toolbar and research question. Otto peeks from the right edge and opens a floating panel; Dock reserves a desktop column, Float restores the document width. Ctrl/⌘ K toggles Otto, Ctrl/⌘ Shift K opens commands, and Escape closes Otto with focus returned to its trigger. Extra writing tools live under More.
4. Source library: dedicated empty screen now; validated upload, real processing statuses and cited summaries arrive in Milestone 3 and later.
5. Evidence viewer: the split layout shows the actual saved chapter beside an explicitly empty source viewer. PDF rendering, exact-page passage highlighting and citation insertion await document processing.
6. Empty thesis: create an outline, inspect the source library, or start writing.

## Decisions retained from review

- No arbitrary “Aligned 82%” or “AI-assisted 18%” badges.
- Relevance review will be user-triggered, explained and advisory.
- Never automatically delete a sentence or source.
- Suggest a literature-review outline; do not silently ghostwrite a chapter.
- OCR and sharing stay outside MVP scope.
- Sources/AI screens do not fabricate results while services are pending.

## Implemented editor interactions

Tiptap toolbar, inline chapter-title editing, in-chapter heading navigation, tables, image URLs with required alt descriptions, footnotes, undo/redo, find/replace and slash tools. Chapter reorder supports drag and explicit up/down buttons. Focus mode and keyboard commands remain available.

Save labels distinguish unsaved, saving, browser-saved, cloud-saved, failed and conflicted states. A conflict leaves text visible and offers a downloadable backup. Browser-only mode is explicitly labeled and never described as a private signed-in account.

## Verification

The October 2026 update follows the seven-screen thesa-ui-screens.pdf and thesa-ui_2 source. Sample papers, scores, processing states and chatbot replies are deliberately not seeded into user projects. Save details and chapter backup remain accessible from the header status; browser drafts retain their original storage keys. The source library and evidence reader show unavailable actions explicitly.

Desktop/mobile screenshots and automated browser tests verify representative flows. Axe checks the dashboard/editor in both themes. Automated results do not replace manual screen-reader testing or final large-document performance checks.
