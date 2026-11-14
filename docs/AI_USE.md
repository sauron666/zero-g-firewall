# Use of AI in Zero-G Firewall

We used Claude (Anthropic), as a coding assistant, during 14 and 15 November 2026 to assist with software development, debugging and interface design. The team reviews and tests what it produces; the tests in this repository are part of that.

- Scientific observations come from the cited NASA datasets and documents. Derived values, model outputs and simulated scenarios are labelled separately in the application.
- AI-assisted code is acknowledged here and in commit messages.
- No AI-generated images, video or audio are used so far. The flame drawings are schematics produced by code in this repository and are marked as illustrations.
- No AI-generated content uses or modifies NASA branding, logos, flags or mission identifiers.
- Where the application offers answers written by a language model, a sentence about data is shown only with a citation that resolves to a table row or a document page; numbers come from deterministic code.

Before the event the team prepared research notes, a written plan, the team emblem and one watermarked concept preview of the companion, which is not used in the project. All code, data processing and project assets were created inside the event window.

## AI inside the application

"Ask the evidence" is an agent with typed tools. A question is first screened (an instruction to the engine, a request for a probability, or a name the evidence never mentions ends there). Then a plan of tools runs, each reading only files built by the pipeline: count test rows near a stated atmosphere, rank the investigations for a mission, look up what is measured in a habitat, fetch curator notes, fetch a named record, search the passages, compose, check. Counts and rankings are computed by code. Every other sentence of an answer is taken word for word from a stored passage. The trace under each answer lists the calls as they ran.

Who writes the answer is chosen by the reader and always shown in the top bar.

- **Offline engine (default).** No language model. The planner is a set of rules. Nothing is generated.
- **In this browser.** A model that runs inside the browser tab: the browser's own model through the Prompt API where the browser offers it (Chrome 148 or later on a desktop), otherwise a small open model on WebGPU through WebLLM, fetched once and kept by the browser. No key and no server; no connection after the first download.
- **Local model.** A model on the reader's own computer or network, reached at an address the reader sets (any OpenAI-compatible server, for example Ollama, LM Studio or llama.cpp). Nothing leaves the machine.
- **Cloud model.** Anthropic, OpenAI, Google Gemini or any OpenAI-compatible endpoint, with a key the reader types. The key is kept in that browser's storage and sent only to the address shown. No key is in this repository.
- **Hybrid.** The local model drafts, the cloud model checks the draft against the passages.

In every model mode the same rules hold. The model receives only the passages the tools returned, marked as data, and may only rephrase them. A deterministic checker (`web/src/lib/ai.ts`, `verify`) then keeps a sentence only if it cites a passage that was given, every number in it is in that passage, and it gives no verdict, probability or safety rating. Removed sentences are shown as removed, with the reason. Numbers on the rest of the site are never produced by a model.

Two defences stand in front of the checker and are demonstrated on the page with a planted note: only passages from the hashed index may enter a prompt, and a passage that addresses the model is quarantined. The demonstration also shows what the checker alone would let through, which is why the gates exist.

Each investigation carries an **AI brief**: two sentences written by the AI assistant during the build, from the record's stored text and this site's own table profiles (`pipeline/briefs/briefs.json`). The pipeline checks every brief at every build and drops any that holds a number the record does not hold, gives a verdict, or leans on a curator note that does not exist. A brief is labelled on the page as our reading, not NASA's words.

A scorecard of 36 questions with written pass rules runs in the browser and in the test suite (`web/src/lib/evalset.ts`). It reports held-out questions separately from the ones the engine was improved against.

State: the offline agent, the checker, the scorecard and the demonstration are tested and run on the site. The cloud and local connectors are tested against each service's request and reply format. The in-browser model is tested with stand-ins shaped like the published interfaces. None of the model modes was run against a live model in the build environment.
