# Unofficial iCloud Drive client built on the icloud.com/drive API

## Overview

This is a client for iCloud Drive built on top of a non-public API. It aims to minimize API requests by utilizing caching. Developed with [fp-ts](https://github.com/gcanti/fp-ts), [io-ts](https://github.com/gcanti/io-ts), [yargs-command-wrapper](https://github.com/nktknshn/yargs-command-wrapper) for args parsing.


## Disclaimer

This is an unofficial client. Use it at your own risk. The author is not responsible for any data loss or any other issues that may arise from using this software. Always have a backup of your data.

## Usage

- Install [bun](https://bun.sh/). 

- Clone the repo `git clone https://github.com/nktknshn/node-icloud-drive-client /opt/node-icloud-drive-client/`

- Add alias for convenience `alias idrive='bun /opt/node-icloud-drive-client/src/cli-drive.ts'`

- Fish shell completions for `idrive` are available in `/opt/node-icloud-drive-client/completions/idrive.fish`

```Commands:
  idrive init                       Init new session
  idrive auth                       Authenticate a session
  idrive ls [paths..]               List files in a folder
  idrive mkdir <path>               Create a folder
  idrive cat <path>                 View the content of a text file
  idrive edit <path>                Edit a text file
  idrive mv <srcpath> <dstpath>     Move or rename a file or a folder
  idrive rm [paths..]               Remove files and folders
  idrive download <path> <dstpath>  Download a file or a folder
  idrive upload <uploadargs..>      Upload files and folders
  idrive recover <path>             Recover a file from the trash
  idrive autocomplete <path>        Autocomplete path

Options:
      --help          Show help                                        [boolean]
      --version       Show version number                              [boolean]
  -s, --session-file  Session file
  -c, --cache-file    Cache file
  -n, --no-cache      Disable cache                   [boolean] [default: false]
  -a, --api-usage     API usage strategy
       [string] [choices: "onlycache", "fallback", "validate"] [default: "validate"]
  -d, --debug                                         [boolean] [default: false]

```

### init

Initializes new session. 

`idrive init`

`idrive init -s myicloud.json`

Do not login, just create the session file.

`idrive init --skipLogin`

Authenticate the session file

`idrive auth`

`idrive auth -s myicloud.json`

Use `ICLOUD_SESSION_FILE` environment variable to specify the session file

`export ICLOUD_SESSION_FILE=~/.config/icloud-session.json`

### ls

List directory contents. Supports globs

`idrive ls`

`idrive ls '/MyNotes/my1/'`

`idrive ls '/MyNotes/my1/*.md'`

Multiple paths

`idrive ls /MyNotes/ '/Camera/*.jpg' /Pages/Стильный\ отчет.pages`

More verbose output (adds size, date, item type)

`idrive ls -l '/MyNotes/my1/'`

More verbose output (adds drivewsid, etag)

`idrive ls -ll '/MyNotes/my1/'`

Print folder or file info

`idrive ls -i '/MyNotes/my1/' '/Camera/IMG_0198.jpg'`

Print full paths

`idrive ls -f '/MyNotes/my1/'`

Human readable sizes

`idrive ls -lh '/MyNotes/my1/'`

Sort by size recursively looking for the largest files

`idrive ls -S size -R -h size /`

Recursive listing (may take some time to process deep trees). The command below will save the whole tree into the cache

`idrive ls -R '/`

Use recursive flag for the globstar pattern

`idrive ls -R '/MyNotes/my1/**/*.md'`

Limit the depth of recursion

`idrive ls -R -D 2 '/MyNotes/my1/**/*.md'`

Output result as a tree

`idrive ls -R -D 2 --tree '/MyNotes/my1/'`

Search in the cache (will fail if the cache is not enough to fulfill the request)

`idrive ls -R '/**/*.md' -a onlycache`

Search in the cache and fall back to the API if the cache is not enough

`idrive ls -R '/**/*.md' -a fallback`

list trash

`idrive ls --trash`

### rm [paths..]

Removes files and folders. Supports globs. By default moves files to the trash

`idrive rm '/MyNotes/my1/note.md'`

Multiple paths

`idrive rm '/MyNotes/my1/*.md' /Camera/IMG_0198.jpg`

Use recursion flag for the globstar pattern

`idrive rm -R '/MyNotes/my1/**/*.md'`

Use `--dry` flag to check what is going to be removed

`idrive rm -R '/MyNotes/my1/**/*.md' --dry`

Delete file skipping trash

`idrive rm --skip-trash /Camera/IMG_0198.jpg`

Do not ask for the confirmation

`idrive rm --force /Camera/IMG_0198.jpg`


### cat <path>

View the content of a text file

`idrive cat '/MyNotes/my1/note.md'`

### mv <srcpath> <dstpath>

Move or rename a file or a folder. You cannot move between different zones (e.g. between APP_LIBRARIES and Docws)

`idrive mv /MyNotes/my1/note1.md /MyNotes/my1/note2.md`

Remote file will be renamed

`idrive mv /MyNotes/my1/note1.md /MyNotes/old/note2.md`

### mkdir <path>

Creates a folder

`idrive mkdir /MyNotes/my1/notes/`

### edit

Opens the file in `vi`. If the file is not found, it will be created.

`idrive edit /MyNotes/my1/notes/note1.md` 

Opens the file in a different editor (defaults to `vi`)

`idrive edit --editor subl /MyNotes/my1/notes/note1.md`

`idrive edit /Camera/IMG_0205.PNG --editor gimp`

### upload 

Web version of icloud drive doesn't support overwriting files. Old file has to be removed before uploading.

Upload a single file

`idrive upload ~/Documents/note1.md /MyNotes/my1/notes/`

`idrive upload ~/Documents/note1.md /MyNotes/my1/notes/different_name.md`

Overwrite existing file (removes the old file before uploading)

`idrive upload --overwrite ~/Documents/note1.md /MyNotes/my1/notes/`

Upload multiple files

`idrive upload ~/Documents/note1.md ~/Documents/note2.md ~/Documents/note3.md /MyNotes/my1/notes/`

Upload a folder

`idrive upload -R ~/Documents/ /MyNotes/my1/notes/`

Upload a selection of files

`idrive upload -R '~/Documents/**/*.md' /MyNotes/my1/notes/`

Use `dry` flag to only check what is going to be uploaded.

### download <remotepath> <localpath>

Download a file or a folder content.

`idrive download '/MyNotes/my1/note1.md' ./outputdir`

A single file

`idrive download '/MyNotes/my1/*.md' ./outputdir`

Recursively download folders shallow content into `./outputdir/my1/`

`idrive download -R '/MyNotes/my1/' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/` 

`idrive download -R '/MyNotes/my1/diary/**/*.md' ./outputdir`

`idrive download -RS '/MyNotes/my1/diary/**/*.md' ./outputdir`

Download download all into `./outputdir/MyNotes/my1/diary/`

Use `dry` flag to only check what is going to be downloaded

`include` and `exclude` flags can be used to filter files (supports globs)

### recover

Recover a file from the trash

`idrive recover '/note1.md'`

### autocomplete <path>

Autocomplete path. Used for shell autocompletions.


### API/cache usage strategy

`--api-usage validate`

Default behaviour. Always validates cached paths by retrieving them from API.

`--api-usage onlycache`

Will not use the API. Only retrieve from cache.

`--api-usage fallback`

Retrieves from API if the cache is not enough.
