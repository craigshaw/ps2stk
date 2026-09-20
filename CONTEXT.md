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

**Save package**:
A single file in an established transfer format that contains one complete **save**, including its save files and the metadata represented by that format. Examples include PSU, MAX, SPS, XPS, CBS, and the PS2 variant of PSV.
_Avoid_: Raw file dump, memory card image, or save file when referring to the complete package.

**PS2 PSV package**:
A **save package** used to transfer a PS2 save through a PS3. PSV also has a PS1 variant; a PS2 PSV package is distinct from a native PS3 game save or a complete PS2 Classics memory card.
_Avoid_: PS3 save when the intended meaning is a packaged PS2 save.

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

**Developer**: Is exporting a PSU the same as dumping a save?
**Domain expert**: No. PSU export produces one save package. A save dump produces the separate contained files.
