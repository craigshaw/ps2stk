# PS2 Browser icon presentation research

Status: file, screenshot, and render-sweep investigation began on 2026-09-24. A fixed overview view and selected-screen background were implemented on 2026-09-25. After testing a temporary angle slider, the user chose 45 degrees for the overview. The exact PS2 overview camera rule remains unknown. The user-supplied `TEST.ps2` card and `1.png` to `4.png` screenshots were inspected locally. They are reference material, not repository fixtures or public assets.

## What the save specifies

The [icon.sys format reference](https://www.ps2savetools.com/documents/iconsys-format/) identifies Normal, Copy, and Delete model filenames, lighting, one selected-screen background opacity, and four background corner colours. The [PS2SDK example](https://github.com/ps2dev/ps2sdk/blob/master/ee/rpc/memorycard/samples/mc_example.c) writes these values for a save. There is no camera or overview-view field in `icon.sys`. The [icon model format](https://www.psdevwiki.com/ps2/ICN_Files) describes geometry, texture, and animation data, with no Browser camera field. In all three saves on `TEST.ps2`, the 512-byte unused tail of `icon.sys` is zero and the icon header's reserved value is the same (`1.0`). These checks found no hidden per-save viewing value in those locations; they do not prove every undocumented field is understood.

`TEST.ps2` contains these three saves. Values below were read directly from each save's `icon.sys`. Opacity is on the documented 0 to 128 scale. Colours are the stored RGB values in upper-left, upper-right, lower-left, lower-right order.

| Save | Normal model | Opacity | Background colours | Screenshot match |
| --- | --- | ---: | --- | --- |
| OutRun 2006 | `icon.ico` | 128 | Black at all four corners | Opaque black in `2.png` |
| Sega Rally 1995 | `static.ico` | 64 | `(20,70,90)`, `(20,20,60)`, `(20,20,60)`, `(20,70,90)` | Translucent blue in `4.png` |
| Burnout 3 | `view.ico` | 0 | Black at all four corners | Underlying Browser scene remains visible in `3.png` |

Each save supplies one Normal model. The three `icon.sys` files do not name a separate overview model. Sega Rally and Burnout also name that same model for Copy and Delete. OutRun names three model files, which are byte-identical in `TEST.ps2`, as verified by their SHA-256 hashes. The overview background and selection glow in `1.png` are Browser presentation. The background over that scene after opening a save comes from its `icon.sys` values. This corrects our earlier broad description that treated all backgrounds as Browser-generated.

## What changes between the two screens

`1.png` shows the OutRun car from above/front, while `2.png` shows it from the side. The Burnout and Sega Rally models also show changes in apparent angle or depth, but the effect is less obvious. Each model has its own orientation in its stored vertex coordinates. For example, the Sega Rally sign lies nearly in its local XY plane: it is only about 0.46 model units deep compared with about 3.99 units across. OutRun is about 4.59 units deep. A shared Browser rotation or view change can therefore look dramatic for the car and subtle for the flat sign. This is an inference from the screenshots and measured model bounds, not a recovered PS2 camera matrix.

All three Normal icons report one geometry shape, so stored shape animation cannot account for these changes in apparent angle. The Browser may apply a common rule using each model's geometry, or the screenshot may capture independently moving icons at different phases. Screenshots alone cannot distinguish those possibilities or establish exact values. The [original ps2mc-browser rendering analysis](https://babyno.top/en/posts/2023/10/rendering-ps2-3d-icon/) chooses a 50-degree camera and initial model rotation to approximate the console. Our optional sibling renderer uses one view direction for tiles and its lightbox. Neither source establishes separate, exact PS2 overview and selected matrices. The app now uses separate fixed overview and moving detail views as a visual approximation.

## Render-sweep check

On 2026-09-24, a temporary Three.js page rendered the unmodified geometry, UVs, and textures from each Normal icon with a shared camera. The preview used simple flat lighting to isolate silhouette and angle. Burnout's out-of-range animation shape ID was set to zero in a temporary in-memory copy so its single geometry shape could be displayed; the card image and icon file were not changed. Diagnostic screenshots were kept in `/private/tmp`, outside the repository.

The first sweep raised concern that a fixed angle would flatten the two upright signs. On review, the user judged the fixed 40-degree result close to the PS2 overview in `1.png`. A subsequent check in the actual application, using the real icon textures and lighting, rendered all three saves at that angle. OutRun shows its roof and nose from above; Sega Rally remains readable; Burnout's front face remains clear. The user then adjusted a temporary desktop slider and chose 45 degrees as the final fixed approximation. This is a visual match decision, not proof that OSDSYS uses a 45-degree camera. The earlier thinnest-axis experiment remains a diagnostic comparison, not the implemented rule.

A separate low-elevation sweep showed that ordinary yaw rotation of the three original models produces the side-on OutRun view and the mostly frontal Sega Rally and Burnout views seen in `2.png` to `4.png`. The screenshots were taken at different times, so this does not identify a single selected-screen rotation phase or exact speed.

## Parser finding

Burnout 3's `view.ico` reports one geometry shape and a track with shape ID 1. Its sole key cannot change geometry, so the parser accepts precisely this single-shape case and displays the stored shape. Other out-of-range shape IDs still fail. The [format reference](https://www.psdevwiki.com/ps2/ICN_Files) labels this field but does not define its indexing, so the exception does not establish a general one-based indexing rule.

On 2026-09-25, the user imported a Ridge Racer V PSV save into `TEST.ps2`. Its `icon.sys` names three distinct icon models, all present on the card. Each model contains eight shapes and eight animation tracks. The animation header stores frame length 119, while a final stored key is at frame 120. The previous parser rejected that key as out of range, leaving all three models without previews. It also discarded the first key in every nonempty track as a supposed reserved pair. The actual first pair is meaningful, for example Ridge Racer's first track starts at frame 0 with weight 0.8. The [PS2IODB author's account of their extractor correction](https://issung.com/posts/ps2iodb2026/) independently identifies this first-key omission in related tooling. The parser now reads all stored keys and accepts a final key at the boundary after the header's last frame. Synthetic tests cover both cases, and all three Ridge Racer models parse directly from the user's card. The original PSV package was not available for byte comparison, so these checks do not independently verify every byte of the import.

## Animation reference for later work

The user supplied [this icon rendering article](https://babyno.top/en/posts/2023/10/rendering-ps2-3d-icon/) on 2026-09-25. Its Animation Effects section calculates a cyclic frame from elapsed time, 60 FPS, the icon's speed, and its frame length. It divides that cycle evenly among model shapes, then blends the current and next shape's vertex positions for smooth transitions. The article also applies a separate model rotation in its rendering example.

This is an author's renderer implementation, not a verified OSDSYS playback specification. It does not demonstrate how the console uses stored animation keyframes or its default Copy and Delete action effects. Ridge Racer V now provides stored custom animation tracks for comparison. Console footage is still needed before claiming accurate playback timing or action effects.

## Rendering direction

1. Card-pane previews now use a fixed 45-degree camera and do not rotate on hover or focus. The selected inspector and enlarged viewer retain moving icon playback. This uses the existing shared WebGL context and pause and reduced-motion controls.
2. `icon.sys` opacity and four corner RGB colours now render over the app's dark selected-icon stage. The PS2 blends translucent backgrounds over its own Browser scene, which also contains other save icons. The app does not recreate that scene, so Burnout's transparent and Sega Rally's translucent stages cannot match those screenshots pixel for pixel.
3. A short recording of the same PS2 overview without input, or a controlled rotated synthetic icon on the console, would distinguish a fixed view from independent icon motion or a geometry-derived rule. Avoid per-game angles without such evidence.
4. Keep the result described as a PS2 Browser visual approximation until console transforms and playback timing have been independently established. The screenshots establish appearances at particular moments, not the exact camera or selection-transition animation.
