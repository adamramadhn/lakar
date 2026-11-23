# Digest A — MCP tools (open-pencil core tool registry + MCP layer)
Run scope: open-pencil 1814dcb (clone), gh, Lakar main e41ff57 (status only). Accessed 2026-11-23.

**Path legend.** open-pencil (clone root `C:\Users\Fatmuh\AppData\Local\Temp\lakar-recon\op`): `T/` = `packages/core/src/tools/`, `M/` = `packages/mcp/src/`, `App/` = `src/app/automation/`. Lakar: `L-mcp` = `packages/mcp/src/server.ts`, `L-fix` = `packages/mcp/src/fix-check.ts`, `L-api` = `packages/exec/src/api.ts`, `L-d/x.ts` = `packages/daemon/src/x.ts` (route list only).

**Registry facts.** `ALL_TOOLS = [...CORE_TOOLS, ...EXTENDED_TOOLS]` (`T/registry/index.ts:10`). The CORE_TOOLS array holds 25 tools, though its comment says "26 tools, ~5K schema tokens" (`T/registry/core.ts:33-67`). EXTENDED_TOOLS holds 84 (`T/registry/extended.ts:167-259`). That makes **109 registry tools**. Over MCP, 3 are hidden (`calc`, `diff_changes`, `diff_jsx`, each with `exposure.mcp:false`), so 106 core tools are exposed. The MCP package adds 12 server-only tools, plus `call_mcp_tool` for deferred-tool clients. The total is **up to 119**, depending on the file root and the eval flag. Lakar exposes 19 MCP tools (`L-mcp:386-664` + `L-fix`), and the `execute` sandbox exposes 20 API functions (`L-api:125-180`).

Parameter lists come from each tool's Valibot `input` object. Every MCP document tool also takes `document_id` / `page_id` (`M/tool/registration.ts:39-42`).

## Inventory
| # | Item | What it does (1 line) | open-pencil evidence (path:line) | Lakar status | Lakar evidence | Suggested label | Note |
|---|---|---|---|---|---|---|---|
| | **Read** | | | | | | |
| 1 | get_selection | (depth) Selected nodes with direct children; deeper ones counted as childCount | T/read/selection.ts:10 | have | L-mcp:629 `get_selection` | Skip | Already have it. |
| 2 | get_node | (id, depth) Full properties of a node, depth-limited | T/read/nodes.ts:106 | have | L-mcp:411 `inspect` (depth 0–6, bounds) | Skip | Already have it. |
| 3 | find_nodes | (name, type) Find by name pattern / type | T/read/nodes.ts:130 | have | L-api:63-69 `FindQuery`, :162 `find` | Skip | Lakar adds `within`. |
| 4 | get_jsx | (id, path) Node subtree as JSX in the same syntax `render` accepts (round-trip) | T/read/jsx.ts:38 | have | L-mcp:411 `inspect` returns stored props in `add()` shape | Skip | The read and write formats already match. |
| 5 | get_page_tree | (depth, root_id, node_types) Lightweight outline: id/type/name/size/text | T/read/nodes.ts:53 | partial | L-mcp:405 `list_boards`; L-api:164 `children` | Consider | A cheap outline with a type filter saves tokens on big boards. |
| 6 | list_pages | List document pages | T/read/pages.ts:9 | partial | L-d/pages.ts:118-164 (viewer routes only; the execute API iterates `doc.pages[0]`, L-api:691,748) | Consider | Agents cannot manage pages via MCP. Bundle with #7, #8, #25. |
| 7 | get_current_page | Current page name and id | T/read/pages.ts:42 | partial | as #6 | Consider | Page bundle. |
| 8 | switch_page | (page) Switch page by name or id | T/read/pages.ts:23 | partial | as #6 | Consider | Page bundle. |
| 9 | set_selection | (ids) Select nodes in the editor | T/read/selection.ts:36 | partial | L-d/selection.ts:161 `PUT /viewer/docs/:slug/selection` (viewer only) | Consider | Lets the agent point the user at what it changed. |
| 10 | query_nodes | (selector, page, limit) XPath query over node attributes | T/read/query.ts:10 | partial | L-api:162 `find` (type/name/within) | Skip | JS filtering inside `execute` covers this. |
| 11 | get_bounds | (id) Absolute bbox of a node or the page | T/read/pages.ts:52 | have | L-mcp:411 inspect bounds; execute `bounds` (L-api:968+) | Skip | Already have it. |
| 12 | list_components | (name, source, library_id, limit) Components from doc + libraries | T/read/components.ts:59 | partial | L-api:162 `find` (no "is master" filter) | Consider | A components index helps reuse instead of redraw. |
| 13 | list_libraries | Published component libraries | T/read/libraries.ts:9 | missing | — | Skip | Team/cloud library feature. |
| 14 | insert_library_component | (library_id, revision_id, asset_key, parent_id, x, y, variant_values) Insert from library | T/read/libraries.ts:22 | missing | — | Skip | As #13. |
| 15 | get_font_status | (family) Whether page fonts are faithfully available | T/read/fonts.ts:8 | partial | L-d/render-deps.ts:82 `GET /viewer/fonts`; FONT_MISSING error (L-api:977+) | Consider | An agent-facing font tool would cut FONT_MISSING retries. |
| 16 | list_available_fonts | (family) Installed/bundled/online families | T/read/fonts.ts:29 | partial | as #15 | Consider | As #15. |
| | **Comments & statuses** | | | | | | |
| 17 | list_comments | (includeResolved, page, author) Read canvas comment threads | T/comments.ts:16 | missing | — | Consider | Spatial user→agent feedback pinned to layers suits an external-agent workflow. Needs viewer UI. |
| 18 | add_comment | (text, node, page, x, y, author) Pin a comment on a layer/point | T/comments.ts:45 | missing | — | Consider | Comments bundle. |
| 19 | reply_to_comment | (id, text, author) Reply in a thread | T/comments.ts:75 | missing | — | Consider | Comments bundle ("say what you changed"). |
| 20 | resolve_comment | (id, resolved) Mark a thread resolved | T/comments.ts:97 | missing | — | Consider | Comments bundle. |
| 21 | list_statuses | (status) Document statuses (Draft / In review / Ready for dev) and their layers | T/statuses.ts:10 | missing | — | Skip | Team handoff workflow. |
| 22 | set_status | (node, status) Assign a status to a section/frame/component | T/statuses.ts:34 | missing | — | Skip | As #21. |
| | **Create** | | | | | | |
| 23 | render | (jsx, parent_id, replace_id, insert_index, x, y) JSX → nodes; replace_id edits in place keeping id | T/create/render.ts:9 | have | L-mcp:525 `execute`; L-api:396 `add`, :430 `replace` | Skip | Lakar uses a JS sandbox instead of JSX. |
| 24 | create_shape | (type FRAME/RECTANGLE/ELLIPSE/TEXT/LINE/STAR/POLYGON/SECTION, x, y, w, h, name, parent_id) | T/create/basic.ts:9 | partial | L-api:855-862 closed node catalog (board/frame/text/rect/ellipse/path/icon/instance) | Skip | `path` covers line/star/polygon. |
| 25 | create_page | (name) New page | T/create/basic.ts:51 | partial | L-d/pages.ts:118 (viewer route only) | Consider | Page bundle (#6–8). gh #1327 also asks for page move/index. |
| 26 | create_slice | (x, y, w, h, name, parent_id) Export region | T/create/basic.ts:66 | missing | — | Skip | Lakar exports by node id. |
| 27 | create_vector | (path, fill, stroke, stroke_weight, x, y, name, parent_id) Vector from SVG path / VectorNetwork | T/create/vector.ts:46 | have | L-api:855-862 `path` node (`d`, `viewBox`) | Skip | Already have it. |
| 28 | import_svg | (svg, name, color, parent_id, x, y) SVG markup → layers | T/create/svg.ts:9 | have | L-mcp:460 `paste` kind svg | Skip | Lakar also pastes HTML. |
| 29 | import_mermaid | (mermaid, parent_id, x, y) Mermaid diagram → layers | T/create/mermaid.ts:16 | missing | — | Skip | Diagramming is outside UI design. |
| 30 | create_connector | (start, end, line_type, start_cap, end_cap, label, name) Connector line | T/create/connector.ts:35 | missing | — | Skip | Whiteboard/diagram feature. |
| 31 | search_icons | (queries, limit, prefix) Search Iconify sets | T/create/icons.ts:116 | have | L-mcp:583 `icon_search`; L-api:173 `iconSearch` | Skip | Already have it. |
| 32 | get_icons | (names, size) Fetch icon SVG data | T/create/icons.ts:12 | partial | L-api:855-862 `icon` node by `lib`+`icon` | Skip | Not needed with icon nodes. |
| 33 | insert_icon | (names, name, size, color, parent_id, options) Insert icons | T/create/icons.ts:42 | have | L-api:396 `add({type:'icon'})` | Skip | Already have it. |
| 34 | search_stock_photos | (requests JSON [{id, query, index, orientation}]) Search + apply to placeholders in one call | T/stock-photo.ts:13 | have | L-mcp:602 `photo_search` (+ thumbnails), L-api:179 `photo(ref)` | Skip | Lakar is two steps but returns previews to the agent. |
| 35 | search_web | (query, numResults) Web search for facts/copy | T/web-search.ts:37 | missing | — | Skip | External harnesses already have web search. |
| | **Components** | | | | | | |
| 36 | create_instance | (component_id, x, y) Instance of a component | T/create/components.ts:10 | have | L-api:951+ `{type:'instance'}` | Skip | Already have it. |
| 37 | convert_to_components | (ids) Frames/groups → components | T/structure/hierarchy.ts:77 | have | L-api:481 `setComponent` | Skip | Already have it. |
| 38 | combine_as_variants | (ids) Components → variant set | T/create/components.ts:30 | partial | L-api:483 enum props; `variants` skill listed at L-mcp:396 | Consider | Lakar emulates variants with enum props. A real variant set is a model change. |
| 39 | expose_instance_swap | (instance_ids, candidate_ids, property_name) Instance-swap property | T/create/components.ts:61 | missing | (slots exist: L-api:483) | Consider | Low priority; slots cover most cases. |
| 40 | create_slot | (id) Make a frame in a master a slot | T/create/behaviours.ts:40 | have | L-api:483 `slots:[{name,nodeId}]` | Skip | Already have it. |
| 41 | set_behaviour | (id, behaviour) Master behaves as a Reka UI control in preview/code | T/create/behaviours.ts:9 | missing | — | Skip | Tied to Vue/Reka. Lakar codegen targets React. |
| 42 | get_behaviour | (id) Read behaviour by property/slot | T/create/behaviours.ts:58 | missing | — | Skip | As #41. |
| | **Style (modify)** | | | | | | |
| 43 | update_node | (id, x, y, width, height, rotation, opacity, corner_radius, visible, locked, text, text_direction, flow_direction, font_size, font_weight, name) | T/modify/update.ts:47 | have | L-api:414 `update` | Skip | `locked` has no Lakar equivalent seen. |
| 44 | set_fill | (id, color, color_end, gradient) | T/modify/paint.ts:14 | have | L-api:907+ fills solid/linear/radial/image + conic/noise/mesh | Skip | Lakar is richer here. |
| 45 | set_stroke | (id, color, weight, align) | T/modify/paint.ts:80 | have | L-api:907+ `stroke {…, sides}` | Skip | Already have it. |
| 46 | set_radius | (id, radius, per-corner) | T/modify/geometry.ts:6 | have | L-api:907+ `radius` number or 4-array | Skip | Already have it. |
| 47 | set_effects | (id, type, color, offset_x/y, radius, spread) Shadows/blur | T/modify/effects.ts:10 | have | L-api:932-934 `shadows[]`, `blur`, `backdropBlur` | Skip | Already have it. |
| 48 | set_blend_mode | (id, mode) | T/modify/state.ts:6 | have | L-api:934 `blend` | Skip | Already have it. |
| 49 | set_image_fill | (id, image_data base64/data URL, scale_mode) | T/modify/paint.ts:115 | partial | L-api:907+ `{type:'image', assetId, fit}` (assets via photos; upload path not seen) | Consider | Agent-supplied images (local/generated) are not accepted directly. |
| | **Layout** | | | | | | |
| 50 | set_layout | (id, direction, spacing, padding(_h/_v), align, counter_align, flow_direction) Auto layout | T/modify/layout.ts:14 | have | L-api:859 frame `layout/gap/padding/align/justify`, :895 grid | Skip | Lakar also has CSS grid. |
| 51 | set_layout_child | (id, sizing_horizontal/vertical, grow, align_self, positioning) | T/modify/layout.ts:125 | have | L-api:872-888 `'hug'/'fill'`, `position:'absolute'` | Skip | Already have it. |
| 52 | set_constraints | (id, horizontal, vertical) Resize constraints within parent | T/modify/layout.ts:92 | missing | L-api:888 absolute x/y is top-left relative only | Consider | Right/bottom pinning would simplify absolute overlays such as bottom bars. |
| 53 | set_size_limits | (id, min/max width/height) | T/modify/geometry.ts:43 | have | L-api:874 `minWidth…maxHeight` | Skip | Already have it. |
| | **Text** | | | | | | |
| 54 | set_text | (id, text, markdown) Replace text; optional markdown → styled runs | T/modify/text.ts:28 | partial | L-api:414 `update({content})` (plain) | Consider | Bundle with #56. |
| 55 | set_font | (id, family, size, style, variations) | T/modify/text.ts:105 | partial | L-api:860 `family/weight/style` (no variable-font axes) | Skip | Axes are niche. |
| 56 | set_text_range | (id, start, end, family, size, style, variations, color) Style a character range | T/modify/text.ts:153 | missing | L-api:860 text node has one style | Consider | Mixed-style text (bold word, coloured link) is common in UI copy. Needs a schema change plus migration. |
| 57 | set_text_properties | (id, align_horizontal/vertical, auto_resize, direction, text_decoration) | T/modify/text.ts:201 | partial | L-api:860 `align`, `wrap` (no vertical align / decoration / RTL seen) | Consider | Underline and strikethrough matter for links and prices. |
| | **Structure** | | | | | | |
| 58 | batch_update | (operations JSON) All-or-nothing multi-update, one layout pass | T/structure/batch.ts:73 | have | L-mcp:525 `execute` (full rollback on error, L-api:968+) | Skip | Already have it. |
| 59 | delete_nodes | (ids) Delete; nothing if any id is missing | T/structure/basic.ts:9 | have | L-api:469 `remove` | Skip | Already have it. |
| 60 | clone_nodes | (ids) Duplicate beside original | T/structure/basic.ts:24 | have | L-api:456 `duplicate` | Skip | Already have it. |
| 61 | reparent_node | (id, parent_id) | T/structure/hierarchy.ts:6 | have | L-api:444 `move` | Skip | Already have it. |
| 62 | group_nodes | (ids) Group | T/structure/hierarchy.ts:25 | partial | frames only (L-api:855-862) | Skip | CSS model: a frame is the wrapper. |
| 63 | ungroup_nodes | (ids) Ungroup in place | T/structure/hierarchy.ts:42 | partial | as #62 | Skip | As #62. |
| 64 | flatten_nodes | (ids) Flatten to one vector | T/structure/hierarchy.ts:62 | missing | — | Skip | Low value for UI output. |
| 65 | replace_node | (id, jsx) Replace node with JSX | T/structure/replace.ts:8 | have | L-api:430 `replace` | Skip | Already have it. |
| 66 | get_ancestors | (id) Ancestor chain to page | T/structure/tree.ts:10 | have | L-api:49-55 NodeView `parentId`, `path` | Skip | Already have it. |
| 67 | get_bindings | (id) Variable bindings of a node | T/structure/tree.ts:31 | have | L-api:941+ `get` returns `{$token}` refs as stored | Skip | Already have it. |
| 68 | arrange | (ids, mode spread/compact/pack/grid/row/column/flow/tree/radial/network, direction, gap, cols) Arrange layers | T/structure/arrange.ts:10 | partial | L-api:168 `place(w,h,opts)` for new boards | Consider | `pack`/`spread` for board tidy-up is useful. The diagram modes are not. |
| | **Variables** | | | | | | |
| 69 | list_variables | (query, type) | T/variables/read.ts:18 | have | L-api:166 `getTokens` | Skip | Already have it. |
| 70 | get_variable | (id) | T/variables/read.ts:40 | have | L-api:166 `getTokens` | Skip | Already have it. |
| 71 | create_variable | (name, type, collection_id, value) | T/variables/values.ts:26 | have | L-api:149 `setTokens` | Skip | Already have it. |
| 72 | set_variable | (id, mode, value) | T/variables/values.ts:57 | have | L-api:149 `setTokens` (`modes:{…}`) | Skip | Already have it. |
| 73 | delete_variable | (id) | T/variables/values.ts:76 | have | L-api:149 `setTokens({x:null})` | Skip | Already have it. |
| 74 | bind_variable | (node_id, field, variable_id) Bind/unbind | T/variables/bindings.ts:20 | have | L-api:941+ `{$token:'…'}` values | Skip | Already have it. |
| 75 | list_collections | All variable collections | T/variables/collections.ts:7 | partial | single token set + one mode axis (L-api:151 `setTokenModes`) | Skip | Collections are a Figma-ism. One axis is enough for now. |
| 76 | get_collection | (id) | T/variables/collections.ts:18 | partial | as #75 | Skip | As #75. |
| 77 | create_collection | (name) | T/variables/collections.ts:33 | partial | as #75 | Skip | As #75. |
| 78 | delete_collection | (id) Deletes with its variables | T/variables/collections.ts:46 | partial | as #75 | Skip | As #75. |
| 79 | set_variable_mode | (ids, collection, mode) Show layers in a mode (e.g. a frame in Dark) | T/variables/modes.ts:43 | partial | L-api:858 board `themeMode` only | Consider | Per-frame mode (a dark card on a light page) is a real design need. |
| 80 | get_variable_modes | (id) Mode a layer shows per collection | T/variables/modes.ts:98 | partial | board `themeMode` via inspect | Skip | Follows #79. |
| | **Vector & export** | | | | | | |
| 81 | boolean | (op, ids) Union/subtract/intersect/exclude | T/vector/boolean.ts:22 | missing | — | Skip | Agent can author `d` directly. |
| 82 | get_path | (id) Vector path data | T/vector/path.ts:22 | have | L-api:160 `get` → `d` | Skip | Already have it. |
| 83 | set_path | (id, path VectorNetwork) | T/vector/path.ts:36 | have | L-api:414 `update({d})` | Skip | Already have it. |
| 84 | transform_path | (id, scale, flip, move) | T/vector/path.ts:88 | partial | via `d`/viewBox edits | Skip | Low value. |
| 85 | get_viewport | Viewport position and zoom | T/vector/viewport.ts:11 | partial | L-d/focus.ts:81 `PUT /viewer/focus` (viewer only) | Skip | Viewer concern. |
| 86 | set_viewport | (x, y, zoom) | T/vector/viewport.ts:24 | partial | as #85 | Skip | As #85. |
| 87 | zoom_to_fit | (ids) Fit viewport to nodes (CORE tool) | T/vector/viewport.ts:43 | partial | as #85 | Skip | gh #1390 reported it reset zoom to 100% (closed). |
| 88 | export_svg | (ids, …) SVG markup + warnings for effects SVG cannot draw | T/vector/export.ts:70 | missing | L-mcp:423 `export` is PNG only | Consider | Common handoff format, and Lakar already has path data. |
| 89 | export_pdf | (ids, mode, page_ids) Vector PDF, selectable text | T/vector/export.ts:91 | missing | — | Skip | Print/handoff edge case. |
| 90 | export_image | (ids, format PNG/JPG/WEBP, scale) Raster, "use to visually verify" | T/vector/export.ts:147 | have | L-mcp:556 `screenshot`, :423 `export` (PNG, scale 1/2) | Skip | Already have it. |
| | **Lint / analysis** | | | | | | |
| 91 | lint | (scope, limit) Contrast, touch targets, small text, off-scale spacing/radius, unbound colours, hygiene; sorted by severity; `fix` vs `suggestions` | T/analyze/lint.ts:70 | have | L-mcp:661 `layout_check` (LC rules) | Skip | Rule sets differ. Compare rule-by-rule in another slice. |
| 92 | lint_fix | (scope, suggestions) Safe fixes; with suggestions also first suggestion | T/analyze/lint.ts:91 | have | L-fix:9-17 `fix_check` (safe fixes, `suggestions:true`, `dryRun`) | Skip | Nearly the same design: a safe/suggestion split. |
| 93 | analyze_colors | (limit, show_similar, threshold) Palette frequency, bindings, similar-colour clusters | T/analyze/colors.ts:36 | missing | — | Consider | A palette audit nudges the agent toward tokens. |
| 94 | analyze_typography | (limit, group_by) Families/sizes/weights frequency | T/analyze/typography.ts:12 | missing | (fix_check snaps sizes to type scale, L-fix:12) | Consider | Report-style audit. Cheap. |
| 95 | analyze_spacing | (grid) Gap/padding values, grid compliance | T/analyze/spacing.ts:8 | partial | L-fix:12 "spacing ke token" suggestion | Consider | As #94. |
| 96 | analyze_clusters | (min_count, min_size, limit) Repeated structures = component candidates | T/analyze/clusters.ts:32 | missing | — | Consider | Pushes the agent to componentise repeated cards and rows. |
| 97 | analyze_overlaps | (scope, category, severity, min_area, min_ratio, include_hidden/locked/absolute, page, type, limit) Overlaps and overflows (content over footer, text bleeding out, accidental sibling overlap) | T/analyze/overlaps/index.ts:334 | partial | L-mcp:235-241 LC-02a clipped, LC-20 bottom zone | Adopt | Generalises Lakar's LC-02a/LC-20 to sibling overlap and text overflow, a frequent agent defect. Add as layout_check rules, not a new tool. |
| 98 | describe | (id, ids, depth auto, grid) Semantic description: roles + issues (empty icon, low contrast, layout issues) | T/describe/index.ts:9; T/describe/issues.ts:15-21 | partial | L-mcp:411 `inspect` (raw props + bounds) | Consider | A semantic summary is cheaper for the agent to read than raw trees. |
| | **Visual / diff** | | | | | | |
| 99 | diff_pixels | (from, to node ids, scale, threshold) PNG with changed pixels red + ratio + region | T/analyze/diff/visual.ts:76 | have | L-mcp:638 `visual_diff` (between revs, per region with nodes) | Skip | Lakar's rev-based version fits agent self-checks better. |
| 100 | diff_nodes | (from, to, depth) JSX attribute patch between two trees | T/analyze/diff/tools.ts:44 | missing | — | Skip | Low value without a JSX patch format. |
| 101 | preview_patch | (id, attributes) Preview setting attributes without changing | T/analyze/diff/tools.ts:75 | missing | (L-fix `dryRun` only) | Consider | A generic `execute` dry-run (render + check, no commit) would serve the same purpose. |
| 102 | apply_patch | (patch, dryRun, force) Apply patch; old values must still match unless force | T/analyze/diff/tools.ts:117 | missing | — | Skip | Lakar has rev/CONFLICT instead. |
| 103 | diff_changes | (id) Structural patch of what this run changed. **Not exposed over MCP** (`exposure:{mcp:false}`) | T/analyze/diff/changes.ts:45,50 | partial | L-mcp:638 `visual_diff since:'session'` (pixel); L-d/files.ts:334 revs | Consider | A structural session diff would complement the pixel diff before reporting. |
| 104 | diff_jsx | Structural JSX diff. **Hidden on all interfaces** | T/read/jsx.ts:86,91 | missing | — | Skip | Dead or internal in open-pencil. |
| | **Utility** | | | | | | |
| 105 | eval | (code) JS with Figma Plugin API; `availability:'eval'`, off unless `OPENPENCIL_MCP_EVAL=1` | T/analyze/eval/index.ts:8,13-14; M/tool/policy.ts:77 | have | L-mcp:525 `execute` (QuickJS sandbox, default path) | Skip | Inverse design: Lakar's sandboxed script is the main write path, while open-pencil's eval is an opt-in escape hatch. |
| 106 | calc | (expr) Arithmetic "ALWAYS use instead of mental math". **Not on MCP** | T/calc.ts:26,34 | missing | — | Skip | AI-chat only. Harness agents can compute in `execute`. |
| | **Codegen** | | | | | | |
| 107 | export_design_tokens | (format css/tailwind/dtcg, collection, type) Variables → CSS vars / Tailwind v4 @theme / W3C DTCG | T/codegen/tokens.ts:52 | partial | L-mcp:441 `export_code` `tokens` (tokens.css) | Consider | DTCG output is the missing piece. |
| 108 | import_design_tokens | (files, add_missing, styles) DTCG / resolver / Tokens Studio → variables + text/effect styles | T/codegen/tokens.ts:92 | partial | L-api:158 `importCssVariables` (CSS only) | Consider | DTCG import lets the agent bring a brand in from a codebase. |
| 109 | export_component_map | (page) Components, variants, props, instance counts, screens, deps | T/codegen/component-map.ts:115 | missing | (L-mcp:441 export_code emits component files) | Skip | export_code already covers handoff. |
| | **MCP-server-only tools** | | | | | | |
| 110 | list_documents | Open docs/tabs with ids, paths, pages | M/tool/registration.ts:249; M/tool/manifest.ts:38 | have | L-mcp:500 `list_documents` | Skip | Already have it. |
| 111 | open_document | (path) Open .fig/.pen inside MCP root (filesystem availability) | M/tool/registration.ts:313; manifest.ts:58 | partial | L-mcp:482 `open_doc` (slug, not a file path) | Skip | File-format import belongs to another slice. |
| 112 | list_recent_documents | Recent files inside MCP root | M/tool/registration.ts:345 | partial | L-mcp:500 list_documents | Skip | Not needed. |
| 113 | create_document | (path) New empty document | M/tool/registration.ts:363 | have | L-mcp:482 `open_doc {name}` creates a new doc | Skip | Already have it. |
| 114 | save_document | (path) Save to .fig/.jam | M/tool/registration.ts:268 | have | every commit is a stored rev (L-d/files.ts:334 revs) | Skip | Lakar has no unsaved state. |
| 115 | close_document | (unsaved error/save/discard, path) Close tab; never prompts | M/tool/registration.ts:400-456; manifest.ts:85 | missing | — | Skip | No unsaved state, so little value. |
| 116 | activate_document | (document_id, page_id) Bring tab to front | M/tool/registration.ts:458 | partial | L-mcp:482 open_doc opens as tab | Skip | Covered. |
| 117 | undo | Undo newest MCP/CLI change; fails if newest step was made in editor | M/tool/manifest.ts:103-111; App/bridge/app-handlers.ts:32-38 | have | L-mcp:507-523 (per session, steps ≤ 50, CONFLICT if any other rev after) | Skip | Lakar is stricter: per session, not any agent. |
| 118 | redo | Redo newest automation-undone change | M/tool/manifest.ts:112-119 | have | L-mcp:507-523 | Skip | Already have it. |
| 119 | get_settings | Editor settings (theme, snapping, rendering, AI chat, design checks) | M/tool/registration.ts:499; manifest.ts:121 | missing | — | Skip | Editor prefs are not the agent's job. |
| 120 | update_settings | (settings partial) Validated patch; credentials/tool access not exposed | M/tool/registration.ts:508; manifest.ts:130 | missing | — | Skip | As #119. |
| 121 | get_codegen_prompt | Design-to-code guidelines prompt | M/tool/registration.ts:531 | partial | L-mcp:392 `read_skill`; L-mcp:441 export_code (deterministic) | Skip | Covered by skills. |
| 122 | call_mcp_tool | (toolName, arguments) Proxy for clients that defer tools past a schema budget (Antigravity over ACP) | M/tool/registration.ts:541-559 | missing | — | Skip | Lakar has 19 tools, so no budget problem. |
| | **MCP layer** | | | | | | |
| 123 | Automation target `document_id`/`page_id` | Every document tool can target any open doc/page; default = the doc the session last used | M/tool/registration.ts:35-53; M/instructions.ts:157-162 | partial | L-mcp:482 session-active doc via `open_doc` | Skip | Lakar's per-session active doc is simpler. Revisit only with the page bundle. |
| 124 | Server instructions | Short model-facing intro to the tools | M/instructions.ts:157-162 | have | L-mcp:170 `SERVER_INSTRUCTIONS` | Skip | Already have it. |
| 125 | Tool annotations `readOnlyHint` / `destructiveHint` | Derived from each tool's effect (read/write) for every registered tool | M/tool/registration.ts:103-108,157; manifest.ts:7-9 | missing | L-mcp:386-664 registers tools without `annotations` | Adopt | Cheap. Harnesses can auto-approve reads (status, inspect, screenshot, list_*), and it stays backward-compatible as metadata only. |
| 126 | Capability metadata | `_meta['openpencil/capabilities']` per tool: document/filesystem/network/code/settings read/write | M/tool/registration.ts:158; T/schema.ts:33-41 | missing | — | Consider | Bundle with #125 if harnesses read it. Unverified that any do. |
| 127 | Tool policy | `OPENPENCIL_MCP_DISABLED_TOOLS` (comma list) and `OPENPENCIL_MCP_EVAL` opt-in; descriptors carry `enabled` | M/tool/policy.ts:50-81; M/index.ts:31-35 | missing | — | Consider | Cheap env switch, useful for bench ablations. |
| 128 | Selection scope | `OPENPENCIL_MCP_SCOPE=selection`: only get_selection/get_node/get_page_tree/describe/export_image; app rejects ids outside selection; file writes refused | M/tool/scope.ts:84-99,116-118,137-152 | missing | — | Skip | Privacy feature for sharing part of a doc. A single-user local tool has little need. |
| 129 | Auth: server token vs client token | Server token opens mcp/rpc/files/app; client token = HMAC-SHA-256 of server token, opens `/mcp` only | M/auth.ts:10-25; M/tool/client-token.ts:6-13 | partial | Lakar: loopback + Origin guard on `/viewer/*` writes (not verified in code this run) | Consider | Any local process can call lakard. Weigh a token against the convenience of a local daemon. |
| 130 | Transports | stdio bridge → HTTP (Unix socket or TCP); Streamable HTTP `/mcp` on Hono; Unix socket default on mac/Linux, TCP 7600 (Windows TCP only) | M/stdio/bridge.ts:28-33; M/server.ts:137,207; M/index.ts:17-24 | partial | L-mcp:380-384 stdio server + DaemonClient → HTTP lakard | Skip | stdio is enough for local harnesses. |
| 131 | App-attached execution | MCP server relays to the live app over WebSocket; app executes against its EditorStore; tool calls fail APP_NOT_CONNECTED after 10 s without app | M/server.ts:116-119,261-268; App/bridge/server.ts:5-9 | different | Lakar daemon executes headless (L-d/server.ts:497 `/execute`) | Skip | Lakar's headless daemon avoids the webview wedge class (gh #975, #1607). |
| 132 | Discovery file | `mcp.json` with socket path, port, plaintext auth token, client token, scope | M/transport/discovery.ts:13-36 | missing | fixed port 7466 | Skip | Not needed with a fixed loopback port. |
| 133 | Sessions | Per-client Streamable HTTP sessions, idle timeout 15 min, agent kinds mcp/acp/harness, chat header, app shows agent at work | M/server/sessions.ts:37-51,70; M/tool/registration.ts:76-92 | have | L-d/server.ts:360 `POST /sessions`; L-d/events.ts:563, L-d/connections.ts:46 | Skip | Lakar has an equivalent. Presence detail is unchecked. |
| 134 | Edit serialization | Agents' edits take turns via a document lock; a call cancelled while waiting never edits | App/execution/lock.ts:7-12 | have | rev-based commits + CONFLICT (L-mcp:507-523; L-api:977) | Skip | Different mechanism, same goal. |
| 135 | Undo ownership & labels | Each agent call is one undo step labelled `Agent: <op>`; undo refuses steps not labelled so | App/execution/editor.ts:10-19,58-63; App/bridge/app-handlers.ts:34-38 | have | L-mcp:507-523 (session-scoped, rev "Undo: <description>") | Skip | gh #883 (open): user edits leak into the agent's undo step. Lakar's rev model avoids this. |
| 136 | Strict input validation | Strict objects: misspelled or mis-nested args fail with a per-arg summary | T/schema.ts:116-130 | partial | L-api:857 execute API rejects unknown keys; L-mcp tool inputs use `z.object(...)` (strip mode by default, unverified at runtime) | Consider | Check whether a misspelled MCP arg is silently dropped. If so, make it strict. |
| 137 | File root sandbox + file output | Symlink-resolving `resolveSafePath`; exports can write `path` inside root; root defaults to home on Windows | M/tool/registration.ts:170-241; M/index.ts:30 | partial | L-mcp:200-203 export writes to `<dataDir>/exports/…` | Skip | Fixed output dir is enough. |
| 138 | Result size caps | Image results over MAX_RESULT_BYTES fail with a "smaller region / lower scale" hint | M/tool/registration.ts:211-229 | partial | L-mcp:194-197 inspect 32 KB depth fallback | Skip | Lakar already has caps where needed. |
| 139 | WebMCP | Browser-native tool registration via `document.modelContext`; per-tool `exposure.webmcp` | T/schema.ts:47-48; App/webmcp/ (dir) | missing | — | Skip | Speculative browser API. Not an agent path for Lakar. |
| 140 | In-app AI chat tool subset | CORE_TOOLS (25 tools, ~5K schema tokens) for the built-in chat; `exposure.ai` | T/registry/core.ts:32-67 | missing | — | Skip | Lakar delegates design to external agents. |
| 141 | Desktop connection | App spawns the MCP server with an attach-grace watchdog (`OPENPENCIL_MCP_APP_TIMEOUT_MS`), polls health, webview connects by WebSocket; root defaults to home | App/mcp/spawn.ts:69-77,259-261; M/index.ts:41-45; desktop/src/agents/mcp.rs:1-5 | unchecked | (apps/desktop not in slice) | Skip | Lakar's sidecar model is outside this slice. |
| 142 | Agent call id passthrough | Forwards Codex `callId` / Claude Code `claudecode/toolUseId` so the app chat shows the call | M/tool/registration.ts:114-121,127-136 | missing | — | Skip | Only matters with an in-app chat. |

Status counts: have 52, partial 46, missing 42, different 1, unchecked 1 (142 rows).
Label counts: Adopt 2, Consider 36, Skip 104.

## Claims
- {claim: "open-pencil's registry is ALL_TOOLS = CORE_TOOLS (25 entries, although the comment says 26 tools, ~5K schema tokens) + EXTENDED_TOOLS (84 entries) = 109 tools.", source: "packages/core/src/tools/registry/index.ts:10; registry/core.ts:32-67; registry/extended.ts:167-259", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "Three registry tools are not exposed over MCP: calc and diff_changes (exposure mcp:false), and diff_jsx (hidden on mcp, ai and webmcp). MCP therefore gets 106 core tools plus 12 server-only tools (list/open/create/save/close/activate documents, list_recent_documents, undo, redo, get/update_settings, get_codegen_prompt) and a conditional call_mcp_tool.", source: "packages/core/src/tools/calc.ts:34; analyze/diff/changes.ts:50; read/jsx.ts:91; packages/mcp/src/tool/manifest.ts:30-150; tool/registration.ts:541", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "Every MCP tool gets readOnlyHint/destructiveHint annotations derived from whether its execution mutates the document, plus _meta 'openpencil/capabilities'.", source: "packages/mcp/src/tool/registration.ts:103-108,152-159; tool/manifest.ts:7-9", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "MCP undo/redo only reverts steps labelled 'Agent: …' (made through MCP or the CLI) and refuses with an error naming the step when the newest step was made in the editor. Ownership is 'any automation', not per session.", source: "src/app/automation/execution/editor.ts:10-19; src/app/automation/bridge/app-handlers.ts:32-38; packages/mcp/src/tool/manifest.ts:103-119", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "The MCP server does not execute tools itself. It relays each call over WebSocket to the running app, which executes against its live EditorStore, and calls fail with APP_NOT_CONNECTED if no app registers within 10 s.", source: "packages/mcp/src/server.ts:116-119,261-268; src/app/automation/bridge/server.ts:5-9", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "Users report MCP mutation tools wedging the desktop WebView (100% CPU, unsaved state lost) and an open bug that user edits made while an agent edit waits land in the agent's undo step.", source: "gh issues open-pencil/open-pencil #975 (OPEN, 2026-10-08), #883 (OPEN, 2026-10-04), #1584 (OPEN, 2026-10-28, 'Make MCP sessions reliable for long-running desktop clients')", publisher: "open-pencil project (issue tracker)", pub_date: "2026-10-04..2026-10-28", accessed: "2026-11-23", confidence: medium, class: sentiment}
- {claim: "eval (JS with the Figma Plugin API) is availability 'eval' and only enabled with OPENPENCIL_MCP_EVAL=1. Individual tools can be disabled with OPENPENCIL_MCP_DISABLED_TOOLS.", source: "packages/core/src/tools/analyze/eval/index.ts:13-14; packages/mcp/src/tool/policy.ts:55-81", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "A selection scope (OPENPENCIL_MCP_SCOPE=selection) limits clients to get_selection, get_node, get_page_tree, describe and export_image. The app rejects node ids outside the selection, and file writes are refused.", source: "packages/mcp/src/tool/scope.ts:84-118,137-152", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "Auth splits a full-power server token (scopes mcp/rpc/files/app) from a client token derived by HMAC-SHA-256 that opens only /mcp. Both are written in plaintext to a discovery file.", source: "packages/mcp/src/auth.ts:10-25; tool/client-token.ts:6-13; transport/discovery.ts:13-36", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "lint/lint_fix split findings into a safe 'fix' (bind colours to matching variables, round to whole pixels) and judgment 'suggestions' (snap radius/spacing, raise min text size, groups→frames, delete hidden layers) applied only with suggestions:true.", source: "packages/core/src/tools/analyze/lint.ts:69-104", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "analyze_overlaps detects content covering a footer, text bleeding out of its frame and accidental sibling overlap, with scope/category/severity/area filters.", source: "packages/core/src/tools/analyze/overlaps/index.ts:333-338", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "Canvas comments are a full agent tool set: list_comments, add_comment (pinned to a layer or point), reply_to_comment and resolve_comment.", source: "packages/core/src/tools/comments.ts:15-117", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}
- {claim: "set_text_range styles a character range (family, size, style, variations, color), and set_text accepts markdown, i.e. the text model supports mixed-style runs.", source: "packages/core/src/tools/modify/text.ts:28-30,152-155", publisher: "open-pencil project", pub_date: "2026-11-23 (present at HEAD 1814dcb)", accessed: "2026-11-23", confidence: high, class: features}

## Leads worth chasing
- Rule-by-rule comparison of open-pencil `lint` rules (`packages/core/src/tools/analyze/lint.ts` → `runLint`, and `describe/issues.ts`, `describe/layout-issues.ts`) with Lakar LC rules. This slice only matched them at tool level.
- `analyze_overlaps` heuristics (`T/analyze/overlaps/helpers.ts`, `params.ts`): reusable thresholds for a new Lakar LC rule (#97).
- `describe` role inference (`T/describe/roles.ts`, `summaries.ts`): how it labels buttons/cards. That could inform a compact `inspect` mode.
- Whether harness clients (Claude Code, Codex) actually auto-approve based on `readOnlyHint`. This decides the payoff of #125. Not verified this run.
- Whether Lakar's `z.object` MCP inputs silently drop misspelled keys (#136). Needs a quick runtime test.
- gh #1327 (open): agents want page move / index on create_page. This is demand evidence for page tools.
- `import_design_tokens` accepts DTCG folders, `.resolver.json` and Tokens Studio `$themes` (`T/codegen/tokens.ts:92-94`). This is a candidate for the token-import backlog.

## Looked for, not found
- MCP resources or prompts (`registerResource` / `registerPrompt`): none seen in `packages/mcp/src/tool/registration.ts`. The codegen prompt is shipped as a tool (`get_codegen_prompt`).
- `idempotentHint` / `openWorldHint` annotations: only readOnly/destructive are set (`M/tool/registration.ts:103-108`).
- A per-session undo stack in open-pencil: undo is gated by label prefix, not session id (`App/execution/editor.ts:17-19`).
- The 26th CORE tool the comment claims: the array has 25 entries (`T/registry/core.ts:36-67`).

## Not covered (budget)
- Per-tool output shapes and full description text for most tools (only names, input keys and the first description line were read).
- WebMCP policy/registration details (`src/app/automation/webmcp/*`), the HTTP lifecycle (`M/server/lifecycle.ts`), pending-request cancellation (`M/server/pending-requests.ts`), and file I/O handlers (`M/server/files.ts`).
- CLI exposure of the same tools (`packages/cli`) and the harness companion (`packages/harness`).
- Lakar desktop sidecar connection (not in slice paths) and Lakar Origin-guard code (status for #129 taken from the route layout, not read).
