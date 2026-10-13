# Domain terms

| Term | Meaning |
| --- | --- |
| Memory card image | A file representing a PS2 memory card, including its file system and contents. A physical card is the device represented by the image. |
| Memory card image filename | The host filename shown for an open card and suggested for whole-card downloads. It is separate from data inside the card. |
| Save | One directory on a card, together with its contents. Separate directories remain separate saves even when they belong to the same game. |
| Save file | One file inside a save, such as game data, icon configuration, or an icon model. |
| Raw file dump | Exact save-file bytes without a header, wrapper, or surrounding card file system. |
| Save dump | All files from one save, exported separately with original names, structure, and bytes. |
| Save package | One file in an established transfer format containing a complete save and the metadata that format supports. Examples: PSU, MAX, SPS, XPS, CBS, and PS2 PSV. |
| Save archive | A ZIP or RAR file containing one or more save packages, possibly with other files. Import selects one package and retains its format rules. |
| PS2 PSV package | A save package used to transfer a PS2 save through a PS3. It is distinct from PS1 PSV, native PS3 saves, and PS2 Classics whole-card images. |

Use **memory card image** for the card, **save** for its directory and contents,
and **save file** for one contained file. A game can use several separate saves.
A save dump contains separate files; a save package contains one container.
