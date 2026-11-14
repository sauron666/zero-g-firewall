# Use of AI in Zero-G Firewall

We used Claude (Anthropic), as a coding assistant, during 14 and 15 November 2026 to assist with software development, debugging and interface design. The team reviews and tests what it produces; the tests in this repository are part of that.

- Scientific observations come from the cited NASA datasets and documents. Derived values, model outputs and simulated scenarios are labelled separately in the application.
- AI-assisted code is acknowledged here and in commit messages.
- No AI-generated images, video or audio are used so far. The flame drawings are schematics produced by code in this repository and are marked as illustrations.
- No AI-generated content uses or modifies NASA branding, logos, flags or mission identifiers.
- Where the application offers answers written by a language model, a sentence about data is shown only with a citation that resolves to a table row or a document page; numbers come from deterministic code.

Before the event the team prepared research notes, a written plan, the team emblem and one watermarked concept preview of the companion, which is not used in the project. All code, data processing and project assets were created inside the event window.

## AI inside the application

"Ask the evidence" works in four ways, chosen by the reader and always shown in the top bar.

- **Offline engine (default).** No language model. Passages are found with BM25 in the browser and the answer is made of sentences taken from those passages. Nothing is generated.
- **Local model.** A model on the reader's own computer, reached at an address the reader sets (any OpenAI-compatible server, for example Ollama, LM Studio or llama.cpp). Nothing leaves the machine.
- **Cloud model.** Anthropic, OpenAI, Google Gemini or any OpenAI-compatible endpoint, with a key the reader types. The key is kept in that browser's storage and sent only to the address shown. No key is in this repository.
- **Hybrid.** The local model drafts, the cloud model checks the draft against the passages.

In every model mode the same rules hold. The model receives only the retrieved passages, marked as data. A deterministic checker (`web/src/lib/ai.ts`, `verify`) then keeps a sentence only if it cites a passage that was given, every number in it is in that passage, and it gives no verdict, probability or safety rating. Removed sentences are shown as removed, with the reason. Numbers on the rest of the site are never produced by a model.

State: the offline engine and the checker are tested and run on the site. The model connectors are tested against each service's request and reply format; they were not run against live services in the build environment.
