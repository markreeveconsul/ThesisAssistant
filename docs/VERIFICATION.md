# Verification — 10 October 2026

Environment: Windows, approximately 16 GB RAM, Intel integrated graphics; local Ollama with `qwen2.5:3b` and `nomic-embed-text`.

Verified against the implementation in this repository:

- Backend: 44 tests passed with `RUN_OLLAMA_TESTS=1`, including actual local embedding/chat inference. Without that flag, 43 pass and the live-model test is skipped.
- Live-model test: upload three synthetic PDFs; answer the sleep-duration question with a citation to `trial.pdf`, page 2; abstain on unreported funding; summarize a methods-only document without inventing an aim.
- Browser: Playwright + headless Edge passed the full signup/project/upload/chat/source-preview/note/history/summary/file-delete/project-delete journey against disposable servers and real Ollama. The final browser test took approximately 1 minute 20 seconds, excluding server startup.
- Final TypeScript/Next.js production build passed. A temporary clean Git clone also installed successfully into a fresh Python virtual environment, passed 43 deterministic tests (one live test intentionally skipped), and passed `npm ci` followed by a production build.
- `pip check`: no broken requirements.
- `npm audit`: zero reported vulnerabilities after updating the transitive PostCSS dependency.

The initial browser run found a hidden project-delete control; it is now consistently visible. A later summary run exposed an invented claim carrying a valid source ID. The MVP now requires generated sentences to match complete cited source sentences and rejects invented paraphrases; answers are extractive quotations. Regression tests cover fabricated claims, spurious citations on abstentions, and phrases cut away from negations.

These tests use synthetic documents. They do not establish accuracy across arbitrary thesis corpora, semantic relevance of every selected quotation, source truthfulness, or absolute resistance to prompt injection. See README limitations.
