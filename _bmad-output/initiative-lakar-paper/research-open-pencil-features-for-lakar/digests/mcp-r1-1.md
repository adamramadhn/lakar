# Digest mcp-r1-1 — open-pencil MCP server and AI-agent workflow

Run scope: open-pencil clone at commit 68f8cad (local scratchpad clone), plus `gh` issues/PRs. Accessed 2026-11-23.

Note on pub_date: the clone is shallow (a single commit, 68f8cad, dated 2026-11-23), so `git log -1 -- <path>` returns 2026-11-23 for every file. Read the repo dates below as "present at HEAD on 2026-11-23", not as last-modified dates. PR and issue dates come from GitHub.

Paths are relative to the clone root. "Repo" = open-pencil repo (github.com/open-pencil/open-pencil).

## Findings

### Q1 — Tool inventory, by purpose

1. **Claim:** Core declares roughly 115 named tools. Grouped by purpose:
   - **Read:** get_node, get_page_tree, find_nodes, query_nodes (XPath), get_jsx, get_selection, get_bounds, get_ancestors, list_pages, get_current_page, list_components, list_libraries, get_icons, list_available_fonts, get_font_status.
   - **Create:** render, create_shape, create_vector, create_page, create_instance, create_slot, create_connector, create_slice, import_svg, import_mermaid, insert_icon, insert_library_component.
   - **Modify:** update_node, batch_update, and the set_* family (fill, stroke, effects, radius, text, text_range, font, layout, layout_child, constraints, image_fill, blend_mode, path, size_limits).
   - **Structure:** group_nodes, ungroup_nodes, reparent_node, replace_node, clone_nodes, delete_nodes, flatten_nodes, boolean, arrange.
   - **Variables:** create, set, bind, delete and list for variables and collections, plus set_variable_mode, import_design_tokens and export_design_tokens.
   - **Analysis:** lint, lint_fix, analyze_colors, analyze_spacing, analyze_typography, analyze_overlaps, analyze_clusters, describe.
   - **Diff:** diff_nodes, diff_pixels, diff_jsx, diff_changes, preview_patch, apply_patch.
   - **Collaboration:** add_comment, list_comments, reply_to_comment, resolve_comment, list_statuses, set_status.
   - **Behaviour:** set_behaviour, get_behaviour.
   - **Export and codegen:** export_image, export_svg, export_pdf, export_component_map.
   - **Assets:** search_icons, search_stock_photos, unsplash, pexels, search_web.
   - **Utility:** calc, eval.
   - **Viewport and selection:** set_selection, set_viewport, get_viewport, zoom_to_fit, switch_page.

   The MCP layer adds its own tools: document lifecycle (list_documents, open_document, create_document, save_document, close_document, activate_document), undo, redo, get_settings, update_settings, get_codegen_prompt and call_mcp_tool.
   - source: `packages/core/src/tools/**` (grep of `name: '…'`); `packages/mcp/src/tool/registration.ts` L440–591
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

2. **Claim:** The skill tells agents not to rely on a fixed tool count or a copied inventory, and to discover tools from the server, because availability varies by version and mode. Users switch tools on or off per surface (Local MCP vs Built-in AI), and "Tool switches are not a sandbox".
   - source: `skills/open-pencil/SKILL.md` L324–330
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

3. **Claim:** `render` is the primary create tool. It takes a JSX string, `parent_id`, `insert_index`, x/y and `replace_id`, and returns `{id, name, type, children[], warnings?, siblings?}`, so the agent gets the new IDs and any authoring warnings in the same response.
   - source: `packages/core/src/tools/create/render.ts` L9–66
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

4. **Claim:** `get_jsx` and `render` round-trip. `get_jsx` returns JSX in the same syntax `render` accepts. Past a length cap (MAX_INLINE_JSX_LENGTH) it outlines: deeper layers come back as `keepChildren` plus a comment naming their ID. Rendering the outline with `replace_id` edits the layer in place. The layer and its descendants that match by type and name keep their IDs, and `keepChildren` layers keep their children. `keepChildren` without `replace_id` is an error.
   - source: `packages/core/src/tools/read/jsx.ts` L38–45; `skills/open-pencil/references/design-authoring.md` L19
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

5. **Claim:** The diff and patch tools work as follows:
   - `diff_nodes` emits an appliable patch: JSX attribute changes per node, plus moved, added and removed children matched by name.
   - `preview_patch` previews setting JSX attributes without changing anything.
   - `apply_patch` is atomic and guarded against stale state. Every node must still hold the patch's old values unless `force` is set, nothing changes unless every hunk applies, and `dryRun` is supported.
   - `diff_pixels` renders two nodes and returns a PNG with changed pixels in red over a faded source, the changed-pixel ratio, and the changed region in source coordinates. Its stated purpose is "confirm an edit only touched the intended area".
   - `diff_jsx` is hidden from MCP and AI (it is kept for the CLI). Agents get `diff_nodes` instead.
   - source: `packages/core/src/tools/analyze/diff/tools.ts` L44–130; `analyze/diff/visual.ts` L76–85; `read/jsx.ts` L86–90
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

6. **Claim:** `diff_changes` returns a patch of everything the current run changed, compared with the page as it was before the run first edited it, in the same format as `diff_nodes`. It is meant as a pre-report self-check ("confirm that only the intended layers changed"). It is available only in in-app AI chat runs (`exposure: { mcp: false }`), because only those record a `changeBaseline`. External MCP agents do not get it.
   - source: `packages/core/src/tools/analyze/diff/changes.ts` L45–56
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

7. **Claim:** `lint` and `lint_fix`:
   - `lint` checks low text contrast, small touch targets and small text, off-scale spacing and radius, colors that match a variable but are not bound, and structure hygiene. Findings are sorted by severity (error, warning, info). Each carries a safe `fix` and/or judgment-requiring `suggestions`.
   - `lint_fix` applies the safe fixes: it binds colors to the matching variable and rounds geometry to whole pixels.
   - With `suggestions: true`, `lint_fix` also applies each finding's first suggestion: snap radius and spacing to the scale, raise text to the minimum size, convert groups to frames, delete hidden layers. It reports what was applied and what remains.
   - source: `packages/core/src/tools/analyze/lint.ts` L70–100; `skills/open-pencil/SKILL.md` L143
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

8. **Claim:** `describe` gives a semantic description with auto-depth (deeper for small subtrees, shallower for big pages). Its heuristic design-issue detectors include:
   - empty icon-sized frames and invisible shapes (no fill and no stroke);
   - subpixel positions and gaps off an 8px grid;
   - touch targets that are too small;
   - stroke with zero weight;
   - pill or circle shapes that do not clip;
   - more than N single-child wrapper frames;
   - a fill that matches the parent's ("invisible border");
   - image containers with no image;
   - nested Text;
   - text containers with no padding, and buttons with no horizontal padding;
   - row children top-aligned with empty space below them;
   - near-invisible fill (<15%) or stroke (<20%);
   - low contrast;
   - nested radius greater than the parent's, or not equal to the parent's radius minus padding (with a `rounded={…}` suggestion).

   A separate `layout-issues.ts` (449 lines) exists.
   - source: `packages/core/src/tools/describe/index.ts` L9–11; `describe/issues.ts` L9–315
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

9. **Claim:** `analyze_overlaps` and `analyze_clusters`:
   - `analyze_overlaps` detects accidental visual overlaps and overflows, such as content covering a footer or text bleeding out of its frame. Its scope options are all, same-parent, cross-parent, top-level and inside-parent. At about 964 lines (index plus helpers) it is the largest analysis module.
   - `analyze_clusters` finds repeated structural signatures (type, size, child structure) as candidate components, with `min_count` and `min_size`.
   - `analyze_spacing` checks gap and padding against a grid (default 8).
   - source: `packages/core/src/tools/analyze/overlaps/index.ts` L334–345; `analyze/clusters.ts` L32–42; `analyze/spacing.ts` L8–18
   - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

10. **Claim:** `arrange` has 10 modes:
    - spread (default): push overlapping layers apart, each staying near where it was;
    - compact: spread, then close the gaps;
    - pack: rows in order, for a page of screens or components;
    - grid, row and column;
    - flow: ranks along connectors and reroutes elbowed ones;
    - tree, radial and network.

    The skill says to call `arrange { ids }` whenever layers the agent created overlap. Separately, `import_mermaid` lays out FigJam flowcharts without overlaps and returns the layer IDs.
    - source: `packages/core/src/tools/structure/arrange.ts` L10–21; `skills/open-pencil/SKILL.md` L312
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

11. **Claim:** `batch_update` is all-or-nothing: a missing node or an invalid prop means nothing changes. All updates run with a single layout recompute.
    - source: `packages/core/src/tools/structure/batch.ts` L73–78
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

12. **Claim:** `calc` and `eval`:
    - `calc` is a batch arithmetic tool ("ALWAYS use instead of mental math"). It is hidden from MCP and WebMCP with the reasoning "Coding agents connected over MCP do arithmetic in their own shell". It is only for the in-app chat.
    - `eval` runs JavaScript against a Figma Plugin API-compatible `figma` global, plus an `openpencil` global. That global adds behaviours, comments, statuses, `bindVariable`, layout and text direction, OkHCL paints, `exposeInstanceSwap` and `getFontStatus`.
    - `eval` enforces Figma's font rule: text edits throw until `loadFontAsync` has run.
    - source: `packages/core/src/tools/calc.ts` L26–35; `analyze/eval/index.ts` L8–16; `skills/open-pencil/SKILL.md` L184
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

13. **Claim:** Comments and statuses:
    - **Comments** are treated as a review-feedback channel for agents. The workflow is: read open comments, change the design, then reply and resolve each one, naming yourself as the author. Over MCP this is `list_comments`, `add_comment`, `reply_to_comment` and `resolve_comment`, and comment text is Markdown.
    - **Statuses** (Draft, In review, Ready for dev) are a document-defined list. `list_statuses` finds layers by status. `set_status` moves a section, frame, component or instance along, but only for layers directly on a page or in a section.
    - Agent comments are not undo steps (see PR #1059).
    - source: `skills/open-pencil/SKILL.md` L204–223; `packages/core/src/tools/statuses.ts` L10–45
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: workflow

14. **Claim:** Codegen:
    - `get_codegen_prompt` returns a bundled codegen prompt (`tools/prompts/codegen.md`, 248 lines) "Call before generating frontend code".
    - `export_component_map` returns a component decomposition: components with variants, props and instance counts; screens; and dependencies.
    - Design tokens export as CSS, Tailwind v4 or W3C DTCG.
    - source: `packages/mcp/src/tool/registration.ts` (get_codegen_prompt block); `packages/core/src/tools/codegen/component-map.ts` L115–118; `SKILL.md` L63
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: capability

15. **Claim:** Tool annotations and selection scope:
    - Every MCP tool carries `readOnlyHint` or `destructiveHint`, derived from a declared `effect`.
    - A "selection" scope (`OPENPENCIL_MCP_SCOPE=selection`) limits the server to get_selection, get_node, get_page_tree, describe and export_image. The app rejects node IDs outside the user's selection and its descendants, and file output is blocked.
    - source: `packages/mcp/src/tool/registration.ts` L102–107; `packages/mcp/src/tool/scope.ts` L1–60; PR #732 (merged 2026-10-07)
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

### Q2 — Agent workflow (skill)

16. **Claim:** The skill's MCP workflow has six steps:
    1. Find or open the document, passing `document_id` and `page_id` explicitly.
    2. Query with page tree, find, XPath or get_node.
    3. Inspect with get_jsx, diff_nodes, diff_pixels, describe and exports.
    4. Modify with render, batch_update and set_*. Use `arrange` for overlaps and `import_mermaid` for flowcharts, and pass photos by `image_path`, not base64.
    5. Save or export.
    6. Close with an explicit `unsaved: save|discard`, because "automation never prompts in the app".
    - source: `skills/open-pencil/SKILL.md` L307–314
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: workflow

17. **Claim:** Leave the user's selection and viewport alone. `zoom_to_fit`, `set_viewport` and `get_viewport` are only for when the user asks to be shown something, because the editor already shows each MCP session as an agent at the layers it touches and follows it when Follow agents is on. PR #725 says that "the agent skill no longer asks agents to select and zoom to their work".
    - source: `skills/open-pencil/SKILL.md` L341, L359; PR #725 (created 2026-09-18, merged)
    - publisher: open-pencil repo / GitHub PR · pub_date: 2026-11-23 / 2026-09-18 · confidence: high · class: workflow

18. **Claim:** Hug-sizing guidance:
    - Use `flex` auto-layout for content, and keep x/y or absolute positioning for overlays and artwork only.
    - Use `"hug"` for notes, cards and long pages "instead of guessing heights".
    - Use `w="fill"` for wrapping text in a column. Don't use `maxLines`, `truncate` or `overflow=hidden` to hide accidental overflow.
    - `between` cannot create room inside a Hug container. Avoid circular Hug/Fill dependencies.
    - Don't compensate for sizing mismatches with guessed heights, clipping or manually positioned siblings.
    - source: `skills/open-pencil/references/design-authoring.md` L9–14, L26, L57
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: workflow

19. **Claim:** Verification rules:
    - Inspect the actual rendered output. "Node counts and `describe` diagnostics do not establish visual fidelity".
    - Check wrapping with longer content, narrower containers, component edits and the relevant variable modes.
    - Fix overflow and contrast at their source.
    - Reuse IDs returned by creation tools instead of searching again.
    - The skill adds: run `export_image` after changes, and use `diff_pixels` to confirm that only the intended region changed.

    The authoring reference is generated from core's guidance and its examples are executed by tests, so it shares one source with the chat and codegen prompts.
    - source: `design-authoring.md` L1, L78–82; `SKILL.md` L337, L348, L358
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: workflow

20. **Claim:** The server-level MCP instructions are a four-sentence primer. They say to read with get_page_tree, get_node and describe; build with render; and change with update_node and set_*. Calls without a `document_id` go to the document the session last worked on, not the active tab.
    - source: `packages/mcp/src/instructions.ts` (whole file); `SKILL.md` L309
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: workflow

### Q3 — Multi-agent and session mechanics

21. **Claim:** Each MCP session has an identity:
    - Every session is an `MCPAgentSession {id, kind: 'mcp'|'acp'|'harness', chat?, defersTools?}`, taken from the first request's headers.
    - Each tool call is stamped with the session, the client name and the agent's own call ID (Codex `callId` or Claude Code `claudecode/toolUseId`).
    - The server allows at most 10 concurrent sessions, closes them after 15 minutes idle, and notifies the app when a session opens or closes so it can show or remove that agent.
    - source: `packages/mcp/src/server/sessions.ts` L37–70, L144–153, L278; `packages/mcp/src/tool/registration.ts` L76–125
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

22. **Claim:** Each session tracks its own document target. A call without `document_id` works on the document this session last named, opened, created or activated, so a tab the user brings to the front does not redirect the agent. `activate_document` is how an agent deliberately shows its tab.
    - source: `SKILL.md` L309; `packages/mcp/src/instructions.ts`
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

23. **Claim:** Undo and redo are scoped to automation steps. `undo` and `redo` "refuse when the newest step was made by the user in the editor; never work around that". PR #1059 made an agent step undo across the whole document (other pages, page add/rename/reorder/remove, variables and collections) by copying the pages a step touches on first write. Comments stay out of undo. The measured overhead is about 2.4–3.5 ms per agent edit on a 26k-layer document. An agent step that lands during a colour-picker batch becomes its own step.
    - source: `SKILL.md` L316, L343; PR #1059 (created 2026-10-10, merged)
    - publisher: open-pencil repo / GitHub PR · pub_date: 2026-11-23 / 2026-10-10 · confidence: high · class: mechanism

24. **Claim:** Live-canvas agent presence (PR #725):
    - Each MCP session appears on the canvas as an agent with a callsign and a cursor. The cursor and outline move to the layers each tool reads or changes.
    - The agent shows a Thinking or Editing state, rests after 20 s idle, and leaves when its session ends.
    - While `render` streams JSX in chat, the agent cursor sits at the newest element and an outline traces the preview.
    - Cursors and the view glide, respecting reduced motion.
    - "Follow agents" is on by default. Escape, scroll or zoom stops following, and people are never auto-followed.
    - Known gaps: ACP and Pi streaming are not wired, and WebMCP calls show no agent.
    - source: PR #725 (created 2026-09-18, merged, +1514 lines)
    - publisher: GitHub PR, open-pencil/open-pencil · pub_date: 2026-09-18 · confidence: high · class: mechanism

25. **Claim:** Subagents get their own cursors (PR #2033). Claude Code's ACP adapter stamps `_meta.claudeCode.parentToolUseId` on subagent tool calls, and OpenPencil maps each MCP call to its subagent. Each subagent then gets its own cursor, callsign and color, and leaves when its Agent call ends. PR #2076 shows subagent work in its own chat thread.
    - source: PR #2033 (created 2026-11-12, merged); PR #2076 (merged 2026-11-13)
    - publisher: GitHub PR · pub_date: 2026-11-12 · confidence: high · class: trajectory

26. **Claim:** No explicit locking or mutex between agents was found in the MCP layer. Concurrency is handled by per-session document targeting, atomic tools (`batch_update`, and `apply_patch` with stale-value checks), and per-step undo. Locking may live in app code that is out of scope.
    - source: `packages/mcp/src/tool/registration.ts` grep for lock/mutex/queue (no hits); `analyze/diff/tools.ts` L117–120
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: medium · class: mechanism

27. **Claim:** For clients with a schema budget (Antigravity CLI), a `call_mcp_tool` meta-tool proxies to all registered tools. In that case `document_id` and `page_id` are dropped from schemas and calls go to the chat's document.
    - source: `packages/mcp/src/tool/registration.ts` L84–91, L535–591
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: high · class: mechanism

### Q4 — Where investment is heaviest

28. **Claim:** Measured by test files, the largest test clusters are:
    - get_jsx and render: about 32 matching test files each, plus about 26 design-jsx test suites, making the JSX round trip the heaviest-tested agent surface;
    - lint: 7 test files; diff: 6; arrange: 6;
    - statuses: 5; overlaps: 3; comments: 3; calc: 2; describe: 1;
    - packages/mcp: 22 test files;
    - editor undo: more than 15 test files.

    By code size, the largest agent modules are the MCP server and registration (about 600 lines each), analyze_overlaps (about 960), describe issues plus layout-issues (about 900), and diff (about 1,000 across 7 files).
    - source: file and test listing at HEAD (`find`/`wc`)
    - publisher: open-pencil repo · pub_date: 2026-11-23 · confidence: medium (test counts are path-match heuristics) · class: trajectory

29. **Claim:** Recent merged PRs show agent presence and attribution as the active direction. That covers live agent cursors and following (#725, Sep), selection-scoped MCP (#732, Oct), whole-document agent undo (#1059, Oct), and subagent cursors and threads (#2033 and #2076, Nov). The AI-assistance notes in those PRs credit Claude Opus 5.5, which suggests the maintainers build with agents themselves.
    - source: `gh search prs` results; PR bodies #725, #1059, #2033
    - publisher: GitHub · pub_date: 2026-09-18 to 2026-11-13 · confidence: high · class: trajectory

30. **Claim:** The April 2026 stress test (issue #208) found five gaps:
    - only Inter was bundled;
    - JSX had no absolute positioning inside auto-layout;
    - there was no custom-SVG path;
    - the AI panel had no setup UI;
    - `tools/list` was not gated on whether the app was connected.

    By HEAD, the authoring reference documents `position="absolute"` and constraints, `import_svg` exists, guided ACP setup exists, and the session manager has `sendToolListChanged`. That suggests most of the gaps were addressed, but this run did not verify each fix.
    - source: issue #208 (created 2026-04-15, closed); `design-authoring.md` L9, L17; `sessions.ts` L134–142; README L148
    - publisher: GitHub issue / open-pencil repo · pub_date: 2026-04-15 · confidence: medium · class: trajectory

## Leads worth chasing

- `packages/core/src/lint/rules/*` and `lint/presets.ts`: the full lint rule list and thresholds. They are outside this run's allowed paths, so only the tool description was read.
- The app side of undo attribution (`tests/app/automation/bridge/handlers.test.ts`, `UndoManager.pushStep`, `captureDocumentChange`), to learn exactly how "the newest step was made by the user" is decided.
- `packages/core/src/tools/describe/layout-issues.ts` (449 lines): the layout-specific issue detectors were not read.
- `packages/core/src/tools/prompts/codegen.md` (248 lines): what the codegen prompt actually tells the agent.
- Docs pages https://openpencil.dev/programmable/mcp-server (WebMCP section) and /programmable/coding-agents. They were not fetched because of the budget.
- In-app chat-only tools (`diff_changes`, `calc`) and the AI chat's change review UI: the before/after review of an agent run looks directly relevant to live-canvas UX.
- PR #803 and PR #807 (shared presence, following people and agents from toolbar avatars), which #725 builds on.

## Looked for, not found

- An explicit locking or mutex mechanism between concurrent agents in `packages/mcp/src`: none found (grep for lock, mutex and queue in registration.ts).
- Per-file commit history: the clone is shallow (single commit), so last-modified dates and commit counts per path were unavailable.
- An automatic post-render lint or describe step: `render` returns only IDs and authoring warnings. Verification is left to the agent through the skill's rules.
- `diff_changes` and `calc` for external MCP clients: both are explicitly hidden from MCP (`exposure: { mcp: false }`).
- A dedicated `screenshot` tool: visual checks go through `export_image` and `diff_pixels`.
