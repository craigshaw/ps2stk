# PS2 Memory Card Application Planning

Status: first-release scope, desktop design direction, stack, and delivery order agreed. Milestone 1 is accepted for further development; milestone 2 editing and session logic are implemented. The user deferred destination game-load tests to milestone 4. See [the implementation plan](./implementation-plan.md) and [milestone 2 validation](./milestone-2-validation.md). Explicit proposals and unresolved details below are not accepted product decisions.

## Confirmed requirements

- Build a single page web application for opening, viewing, managing, and editing PS2 memory card image contents.
- Support two memory card images concurrently in the first release, including copying content between them. Two is the initial maximum.
- Open complete binary PS2 memory card images as the primary input.
- Dump selected files as raw binary data. Dumping a complete save extracts its contained files separately, preserving their names, directory structure, and exact bytes.
- Save complete edited memory cards as binary PS2 memory card images, with or without ECC spare bytes, using a selected filename extension such as .ps2, .mc2, or .bin.
- Render the original PS2 save icons using the sibling ps2mcs icon browser as a starting point.
- Use a modern file explorer interface with deep charcoal and black, translucent surfaces, subtle blue and purple accents, and gentle animation.
- Host on Cloudflare Pages.
- Use Lucide for interface icons where needed.
- Treat the application as a short-session tool: open cards, perform actions, download results, and leave. Do not persist cards or edits across sessions in version 1.

## Agreed first-release editing scope

The user selected file management and replacement on 2026-09-19.

- Copy and delete complete saves.
- Inspect the individual files within a save and export their raw bytes.
- Replace individual files with versions edited outside the application.
- Download the modified memory card image.
- A built-in hex editor and game-specific value editors are outside the first release.

Individual file replacement rules are defined below.

## Agreed individual file replacement

The user confirmed on 2026-09-19 that a replacement file can differ in size from the original, provided it fits on the card.

- Keep the destination file's existing name, regardless of the selected replacement file's name.
- Replace its contents and update its allocation and recorded length.
- Treat replacement as one Undo step.
- If the replacement cannot fit, leave the card unchanged.
- Validate memory card structure, but do not validate game-specific data or recalculate game-specific checksums in version 1.

Milestone 2 uses conservative metadata preservation: retain the destination file's timestamps, mode flags, attributes, and opaque fields, changing only its bytes, length, and allocation. Complete-save replacement takes the source save's metadata. Copy-protection flags remain intact. Editing a card image does not enforce the PS2 browser's copy restrictions.

## Agreed save identity

The user confirmed on 2026-09-19 that each save directory is a separate browser item. A complete save is the directory and its contents. Copying a save copies the whole directory. Separate directories belonging to the same game, such as settings and progress, remain separate saves without automatic grouping.

## Agreed local processing and output

The user confirmed on 2026-09-19 that all memory card processing happens locally in the browser. Card contents are not sent to a server. Cloudflare Pages serves the application.

- Use "Open memory card" for loading an image.
- Apply edits to a working copy in the browser.
- Download modified memory card images through an explicit user action.
- Leave original input files unchanged.

## Agreed session lifetime

The user clarified on 2026-09-19 that this is a short-session utility, not a project-based editor. This supersedes the earlier agreement to recover cards and edits across visits.

- Keep open card images, working copies, and Undo/Redo history in memory for the current page session only.
- Refreshing or closing the page discards session contents. A later visit starts with no open cards.
- Do not implement card autosave, persistent workspaces, project files, session restoration, or persistent Undo history in version 1.
- Users retain results by downloading an edited memory card image or dumping files. Dumping files does not save the complete edited card.
- Original input files remain unchanged.

The user accepted a simple warning before discarding edits that have not been downloaded. Show each card's changed status, confirm before closing or replacing such a card within the app, and request the browser's leave-page warning when applicable. Browser warnings must not be treated as guaranteed recovery or persistence. Milestone 2 tracks the revision last offered as a whole-card download; preparing bytes and raw dumps do not mark it as offered. Browser controls will acknowledge the offer after initiating the download, which does not prove disk persistence.

## Agreed compatibility targets

The user confirmed on 2026-09-19 that exported memory card images must work with both PCSX2 and MemCard PRO2 in the first release.

Release validation must include opening a card image from each source, modifying its contents, exporting the result, and verifying that the destination can load the affected saves. For MemCard PRO2, this includes loading the saves through a PS2. Merely parsing the exported image in this application is not sufficient evidence of compatibility.

This requirement does not imply direct communication with either destination.

On 2026-09-19, the user confirmed that both prepared card images were tested in existing tooling, but the copied OutRun save was not loaded in PCSX2 or on a real PS2. The user agreed to defer those game-load checks to a later stage. They are now part of milestone 4 release validation and do not block milestone 2. Automated checks, independent-tool results, and the user's tooling checks provide the current evidence of card integrity; game compatibility remains unverified.

## Agreed first-release image scope

The user confirmed on 2026-09-19 that the first release targets standard 8 MiB memory cards, supporting images both with and without per-page error-correction spare bytes. The 8 MiB capacity refers to card data; an image with spare bytes has a larger file size.

Larger capacities are outside the first-release requirement. Keep the design open to later support without claiming compatibility before validation. Whole-card output must support layouts with and without ECC spare bytes. Output defaults and handling of unsupported or damaged images are defined in the agreed policies below.

## Agreed copy conflict behaviour

The user confirmed on 2026-09-19 that copying a save to a card with an existing directory of the same name presents a conflict choice.

- Default to "Skip", leaving the destination save unchanged.
- Offer "Replace entire save" as an explicit choice.
- Show source and destination save details before replacement.
- Replacement uses the complete source save. Do not merge files from the two saves or retain files that exist only in the replaced destination save.

Batch conflict presentation remains to be specified. Copy failure behaviour is defined below.

## Agreed copy failure behaviour

The user confirmed on 2026-09-19 that a copy action completes in full or leaves both cards unchanged.

- Resolve conflict choices and check destination capacity before applying changes.
- If the requested copy cannot complete, make no changes and explain the failure. For insufficient capacity, show how much additional space is needed.
- Let the user select fewer saves or free space explicitly; do not copy a subset automatically.
- Apply the same rule if an error occurs during the copy, so no partial destination changes remain.
- Treat a successful copy action as one Undo step, including when several saves were selected. A failed copy adds no Undo step.

Saves explicitly skipped during conflict resolution are excluded from the copy action before validation. The remaining chosen copies and replacements must complete together.

## Agreed damaged-card policy

After discussing implementation overhead, the user confirmed on 2026-09-19 that version 1 rejects structurally invalid or unsupported cards with a clear error. Damaged-card browsing, extraction, and repair are deferred.

Validation needed for safe reading and editing is baseline work: supported geometry and image length, bounded references, complete file reads, allocation consistency, and appropriate ECC checks. The existing parser is not sufficient evidence of validity. For example, its file reader can return fewer bytes than the declared file length without reporting a failure, and its chain iteration guards do not classify corruption.

Read-only access to a damaged card adds a separate requirement: contain parser failures, identify which entries and files remain trustworthy, represent partial results in the UI, and test extraction against deliberately damaged fixtures. Disabling editing controls alone does not deliver that behaviour. The main added effort is in the parser and validation tests, not the interface.

An unreadable or unsupported icon alone uses a fallback preview and does not invalidate an otherwise valid file system. Validation errors must distinguish an unsupported image from detected corruption; neither is an invitation to attempt automatic repair.

## Agreed undo and redo behaviour

The user confirmed on 2026-09-19 that all content changes support Undo and Redo, including deletion, complete save replacement, and individual file replacement.

- Treat one user action as one history step. Copying several selected saves is one step.
- Undo of a replacement restores the complete previous destination content.
- Redo reapplies the reverted content change.

Undo and Redo history exist only during the current page session and are discarded on refresh or close. Milestone 2 implements per-card history with a shared 64 MiB cap on retained card-byte snapshots. Current parsed cards and temporary operation buffers use additional memory. The oldest history boundary is removed when required, and the API reports the eviction count for the UI. Failed operations and no-ops retain existing history, including Redo. A new edit clears only that card's Redo branch. Undo changes the browser working copy; it cannot change an image that has already been downloaded. Returning to the last offered revision clears the changed status.

## Agreed binary input and output

The user clarified on 2026-09-19 that opening complete binary card images and saving complete edited binary card images are the central workflow. This clarification supersedes the earlier ZIP save-package proposal and the question about restricting imports to application-produced packages.

- "Open memory card" accepts a supported complete binary PS2 memory card image. It is not restricted to images produced by this application.
- Dumping an individual save file exports its exact bytes without an added header, metadata file, or archive wrapper.
- "Save memory card" produces a complete edited binary card image, including its file system.
- Whole-card output supports layouts with and without ECC spare bytes and filename extensions .ps2, .mc2, and .bin. Verify destination compatibility and select suitable defaults during implementation planning.
- The filename extension and the binary layout are separate properties. Renaming a file does not add or remove ECC spare bytes.
- A custom save-package format and package-import workflow are not part of the current scope.

The user confirmed on 2026-09-19 that dumping a complete save extracts all its files separately with their original names and exact bytes, as ps2mcd does. Preserve its directory structure. Do not concatenate files into an undefined binary format or add package metadata. The browser mechanism for delivering multiple files remains an implementation question, including browser support and fallback behaviour.

## Agreed whole-card save defaults

The user confirmed on 2026-09-19 that saving an edited card preserves its input binary layout and filename extension by default.

- Images opened with ECC spare bytes save with ECC spare bytes by default.
- Images opened without ECC spare bytes save without them by default.
- Preserve the input extension by default.
- Provide "Save as" for explicit ECC layout conversion and extension selection among .ps2, .mc2, and .bin.
- Saving still produces a download and leaves the original input file unchanged.

Preserving an ECC layout requires generating valid ECC values for changed data. It does not mean retaining stale ECC values from the input.

## Agreed desktop layout

The user approved the interactive layout study on 2026-09-19, with two cards visible, the icon grid at comfortable density, and the shared inspector on the right. Use this as the first-version desktop design direction.

- Show two card panes side by side when two cards are open, so source and destination remain visible.
- With one card open, let its pane occupy the available browsing area.
- Use one shared inspector for the selected save, containing a larger animated icon, details, and individual files.
- Keep small PS2 save icons, names, sizes, and selection controls in the card panes.
- Default to the comfortable icon grid and provide a list view switch.
- Place the shared inspector on the right and allow it to be hidden to make more space for browsing.

The layout study's sample workspace and simulated operations are design aids, not an implementation of card editing. Resizing and narrow-screen behaviour remain to be decided. The bottom inspector alternative is not the chosen default.

The user confirmed on 2026-09-19 that the first release supports a maximum of two open cards. Additional card tabs are a possible later extension, not a first-release requirement. Opening another image when both slots are occupied needs an explicit choice of which card to close or replace, with protection for unfinished work; the detailed interaction remains to be designed.

The first layout study was reviewed interactively during planning. It uses real icon assets from the sibling project's sample images, arranged into a sample workspace. It supports save selection, one-card and two-card layouts, grid and list views, a collapsible inspector, and simulated copy, delete, and undo operations. Design controls offer right-side or bottom inspector placement and two icon densities. The study is a local design aid and is not distributed in this repository; the agreed layout is described above.

The initial browser check verified icon rendering, selection updates, copy and undo, and view switching. The layout was inspected at 1024 pixels and checked for horizontal overflow at 320 pixels. These checks validate only the layout study, not card parsing or editing compatibility.

## Agreed device scope

The user confirmed on 2026-09-19 that the first release targets desktop and laptop browsers, including narrow desktop windows. Dedicated phone and touch workflows are deferred. Supported browser families are defined below; minimum versions remain to be decided.

## Agreed icon animation behaviour

The user confirmed on 2026-09-19 that the large inspector preview and the hovered or keyboard-focused save are the only icons that animate. Other save icons remain still so a full card is easy to scan.

- Provide a pause control for the inspector preview.
- Respect the user's reduced-motion setting.
- Keep save selection and file operations usable without animation.

## Agreed browser support

The user accepted the following first-release support split on 2026-09-19:

- Chrome and Edge: all features, including dumping a complete save into a user-selected folder.
- Firefox and Safari: card editing, whole-card downloads, and individual raw-file downloads. Complete-save folder dumping requires a supported browser such as Chrome or Edge.

Detect folder-write capability at runtime and explain the limitation where that capability is unavailable. Do not block unrelated card editing or download operations. Test the agreed feature set in each supported browser family.

Checked on 2026-09-19: direct export of a save into a user-selected folder depends on directory write access, which is not available across all major browsers. [MDN documents limited availability for showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), and [Chrome documents File System Access support in most Chromium browsers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

This split does not change the required raw binary contents or introduce ZIP packaging. Individual file downloads and complete card image downloads remain independent of directory picker support.

## Existing code and references

Inspected on 2026-09-19. The new project directory was empty and was not a Git repository.

- `../../ps2mcs/icon_browser/js/mcs.js` reads the superblock, allocation tables, directories, and file contents. It has no write operations.
- `../../ps2mcs/icon_browser/js/ps2icon.js` parses icon.sys and 3D icon data. It exposes the normal, copy, and delete icon filenames. Its animation parsing does not preserve the full keyframe data for playback.
- `../../ps2mcs/icon_browser/js/renderer.js` renders icon tiles through a shared WebGL context per renderer and supports an enlarged view with automatic camera framing. Rendering is coupled to tile creation and interaction events.
- The existing parser test targets one specific sample card without ECC spare bytes. This does not establish broad format compatibility.
- The current cluster reader accounts for spare bytes in the cluster start offset but returns a contiguous data slice. Correct handling of spare bytes between pages needs investigation before reuse.
- [ps2mcd](https://github.com/craigshaw/ps2mcd) documents extraction of directories and their individual files. This differs from exporting a complete save as one portable archive. Its README was retrieved; source retrieval failed during this initial inspection.
- [Ross Ridge's file system reference](http://www.csclub.uwaterloo.ca:11068/mymc/ps2mcfs.html) was supplied by the user. Retrieval failed during this initial inspection; its contents have not yet been verified.
- [Lucide](https://lucide.dev/) is the requested source of interface icons.

## Engineering approach

- Refine interaction and responsive behaviour within the approved desktop layout.
- Keep card writing in the agreed separate TypeScript engine, with validation, atomic operations, and round-trip compatibility checks.
- Validate source bytes, metadata preservation, capacity handling, and untouched content before treating a modified image as ready to export.

## Agreed delivery sequence

The user approved this delivery order on 2026-09-19. It defines milestones, not calendar estimates.

1. Prove the card engine on representative 8 MiB images with and without ECC spare bytes. Validate reading, exact file extraction, and export without changes. Add one copy operation and compare against independent tooling so the same parser cannot conceal its own writer errors. Game-load checks are deferred to milestone 4 by the user's subsequent agreement.
2. Complete card operations: deletion, complete-save replacement, different-size file replacement, capacity checks, conflict handling, ECC conversion, and session-only Undo/Redo. Verify that failed operations leave the working card unchanged and successful changes preserve unrelated content.
3. Integrate the approved explorer UI with the engine and adapt the existing icon renderer. Add two card panes, selection, inspector, animation policy, raw dumps, and whole-card downloads.
4. Validate the complete workflow in the agreed desktop browsers and on PCSX2 and MemCard PRO2. Finish accessibility, narrow-window behaviour, and deployment to the requested host.

The first milestone must establish format and writing correctness through independent-tool checks before most production UI work. Game-load compatibility remains a milestone 4 release check. The approved layout study remains the visual reference throughout. A thin test harness is sufficient for early engine checks.

## Agreed implementation stack

The user approved this stack on 2026-09-19:

- React and TypeScript for the explorer UI, selection, dialogs, and inspector.
- Vite for local development and the static production build.
- A separate TypeScript card engine with no React or DOM dependencies, so file system operations can be tested before the UI exists. Use the existing JavaScript parser as reference material and a starting point where validated.
- Adapt the existing Three.js icon renderer and parsers, keeping rendering separate from card modification and UI state. Decide dependency versions during the compatibility work.
- Lucide for interface icons, as already requested.
- Deploy the static build to Cloudflare Pages, with all card processing in the browser and session state in memory. No backend or persistent card storage is required by the agreed scope.

Checked official guidance on 2026-09-19: [React documents building with Vite](https://react.dev/learn/build-a-react-app-from-scratch), [Vite offers a React and TypeScript template](https://vite.dev/guide/), and [Cloudflare documents deployment of Vite builds to Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/). The historical title of Cloudflare's Vite guide does not set the project's Vite version; verify and pin supported dependency versions when scaffolding.

## Hosting setup timing

The stack is agreed, and the user has created [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk). No Cloudflare project, domain, or deployment has been created during planning. A custom domain is not needed to start development. Cloudflare Pages supplies a pages.dev address, and a custom domain or subdomain can be attached later through the project's domain settings.

The user confirmed Git integration on 2026-09-19. Create a Pages project linked to the GitHub repository so builds and preview deployments follow the Git workflow. Choose the Cloudflare account and project name and confirm the production branch at that point. Decide the public domain before launch. The choice between Git integration and Direct Upload is now resolved; Cloudflare does not support freely switching between the project types afterward.

References checked on 2026-09-19: [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/), [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), and [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Remaining details

Milestone 2 has defined metadata preservation, bounded Undo history, and download revision tracking. Remaining details include format edge cases and fixture coverage, browser versions, and explorer interactions. They do not require another general feature interview. Ask one focused question if the evidence exposes a product trade-off.

Keep CONTEXT.md as the domain glossary. Keep product decisions here and executable work items in the implementation plan. Create an ADR only for a consequential trade-off that meets the skill's criteria.
