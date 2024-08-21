# Unofficial ICloud drive client built on icloud.com/drive API

## Overview

This is a client for iCloud Drive built on top of a non-public API. It aims to minimize API requests by utilizing caching. Developed with [fp-ts](https://github.com/gcanti/fp-ts) and [io-ts](https://github.com/gcanti/io-ts).


## Disclaimer

This is an unofficial client. Use it at your own risk. The author is not responsible for any data loss or any other issues that may arise from using this software. Always have a backup of your data. Work in progress.

## Usage
```Commands:
  bun init                       init
  bun auth                       auth session
  bun ls [paths..]               list files in a folder
  bun download <path> <dstpath>  download
  bun mkdir <path>               mkdir
  bun edit <path>                edit
  bun autocomplete <path>        autocomplete
  bun upload <uploadargs..>      upload
  bun mv <srcpath> <dstpath>     move
  bun cat <path>                 cat
  bun rm [paths..]               check updates
  bun recover <path>             recover

Options:
      --help                    Show help                              [boolean]
      --version                 Show version number                    [boolean]
  -s, --sessionFile, --session               [default: "data/last-session.json"]
  -c, --cacheFile, --cache                [default: "data/cli-drive-cache.json"]
  -n, --noCache                                       [boolean] [default: false]
  -d, --debug                                         [boolean] [default: false]

```

### init

`idrive init`

`idrive init -s myicloud.json`

Initializes new session. 

`idrive init --skipLogin`

Do not login, just create the session file.

`idrive auth`

`idrive auth -s myicloud.json`

Authenticate the session file

### ls


`idrive ls '/Obsidian/my1/'`

`idrive ls '/Obsidian/my1/*.md'`

List files in folders. Supports globs

`idrive ls -R '/Obsidian/my1/**/*.md'`

Use recursive flag for the globstar pattern (may take some time to process deep trees)

`idrive ls -R --depth 2 '/Obsidian/my1/**/*.md'`

Limit the depth of recursion

`idrive ls /Obsidian/ '/Camera/*.jpg' /Pages/Стильный\ отчет.pages`

Multiple paths

`idrive ls -R --depth 2 --tree '/Obsidian/my1/'`

Output result as a tree


`idrive ls -t`

list trash


<!-- ???

`idrive ls -t -R` -->

### rm [paths..]

`idrive rm '/Obsidian/my1/note.md'`

Removes files and folders. Supports globs. By default moves files to the trash

`idrive rm '/Obsidian/my1/*.md' /Camera/IMG_0198.jpg`

Multiple paths

`idrive rm -R '/Obsidian/my1/**/*.md'`

Use recursion flag for the globstar pattern

`idrive rm -R '/Obsidian/my1/**/*.md' --dry`

Use `--dry` flag to check what is going to be removed

<!-- `idrive ls -R --depth 2 '/Obsidian/my1/**/*.md'`

??? -->

`idrive rm --skipTrash /Camera/IMG_0198.jpg`

Delete file skipping trash

`idrive rm --force /Camera/IMG_0198.jpg`

Do not ask for the confirmation


### cat <path>

View the content of a text file

`idrive cat '/Obsidian/my1/note.md'`

### mv <srcpath> <dstpath>

Move or rename a file or a folder. You cannot move between different zones (e.g. between APP_LIBRARIES and Docws)

`idrive mv /Obsidian/my1/note1.md /Obsidian/my1/note2.md`

Remote file will be renamed

`idrive mv /Obsidian/my1/note1.md /Obsidian/old/note2.md`

Remote file will be moved and renamed

<!-- `idrive mv --force /Obsidian/my1/note1.md /Obsidian/my1/note2.md`

??? -->


### mkdir <path>

`idrive mkdir /Obsidian/my1/notes/`

Creates a folder

### edit

### upload 

`idrive upload ~/Documents/note1.md /Obsidian/my1/notes/`

`idrive upload ~/Documents/note1.md /Obsidian/my1/notes/different_name.md`

Upload a single file

`idrive upload ~/Documents/note1.md ~/Documents/note2.md ~/Documents/note3.md /Obsidian/my1/notes/`

Upload multiple files

`idrive upload -R ~/Documents/ /Obsidian/my1/notes/`

Upload a folder

`idrive upload -R '~/Documents/**/*.md' /Obsidian/my1/notes/`

Upload a folder 

<!-- 
### uploads [files..] <dstpath>

Upload multiple files to a folder

`idrive uploads note1.md note2.md /Obsidian/`
`idrive uploads *.md /Obsidian/`

`idrive uploads --overwright *.md /Obsidian/`

Upload overwrighting files without asking for confirmation. Overwritten files are moved to the trash

`idrive uploads --skipTrash *.md /Obsidian/`

Delete overwritten files skipping trash

### upload <srcfile> <dstpath>

Upload single file

`idrive note1.md /Obsidian/`

Keeping the filename

`idrive note1.md /Obsidian/newnote1.md`

Use a different filename

### uf <localpath> <remotepath>

Upload a folder. This action doesn't support uploading folder over another folder overwrigting files. It always uploads folder as a new one.

`idrive uf ./node-icloud-drive-client /Documents/projects/`

`idrive uf --include '/**/*.ts' --exclude '/**/cli-drive/**/*' ./node-icloud-drive-client  /Documents/projects/`

Upload a folder node-icloud-drive-client excluding files in cli-drive folder

`idrive uf --include '/**/*.ts' --exclude '/**/cli-drive/**/*' ./node-icloud-drive-client /Documents/projects/ --dry`


Use `dry` flag to only check what is going to be uploaded -->

### download <remotepath> <localpath>

Download a file or a folder content.

`idrive download '/Obsidian/my1/note1.md' ./outputdir`

A single file

`idrive download '/Obsidian/my1/*.md' ./outputdir`

Recursively download folders shallow content into `./outputdir/my1/`

`idrive download -R '/Obsidian/my1/' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/` 

`idrive download -R '/Obsidian/my1/diary/**/*.md' ./outputdir`

`idrive download -RS '/Obsidian/my1/diary/**/*.md' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`

Use `dry` flag to only check what is going to be downloaded

` include` and `exclude` flags can be used to filter files (supports globs)

### recover

`idrive recover '/note1.md'`

Recover a file from the trash

### autocomplete <path>

Autocomplete path. Used for shell autocompletions.

