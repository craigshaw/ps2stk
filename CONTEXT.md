# PS2 Memory Card Management

This context describes PS2 memory card images and their contents.

## Language

**Memory card image**:
A file that represents a PS2 memory card, including its file system and stored contents. A physical memory card is the device represented by an image.
_Avoid_: Save file when referring to the whole card.

**Save**:
A directory on a memory card image, together with its contents, treated as one complete item. Separate save directories remain separate saves even when they belong to the same game.
_Avoid_: Game when referring to one save; save file when referring to the complete directory.

**Save file**:
An individual file contained within a save, such as game data, icon configuration, or an icon model. A save can contain several save files.
_Avoid_: Complete save when referring to one contained file.

**Raw file dump**:
The exact contents of a save file, exported as binary bytes without an added header or wrapper. It contains the file's contents, not the surrounding memory card file system.
_Avoid_: Memory card image when referring to an individual file dump.

**Save dump**:
The files extracted from one complete save, with their original names, directory structure, and exact contents. A save dump consists of separate files rather than one combined binary file.
_Avoid_: Memory card image when referring to an extracted save.

## Example dialogue

**Developer**: Are we opening two physical memory cards?
**Domain expert**: We are opening two memory card images and copying content between them.

**Developer**: Does replacing a save file replace the complete save?
**Domain expert**: No. It replaces one contained file; the other files remain part of the save.

**Developer**: A game has separate directories for settings and progress. Is that one save?
**Domain expert**: Those are two saves, each with its own save files.

**Developer**: Does dumping a save file produce a memory card image?
**Domain expert**: No. The dump contains that file's bytes. Saving the memory card produces the complete memory card image.

**Developer**: What does dumping a complete save produce?
**Domain expert**: A save dump containing each of its files separately, with the original names and bytes.
