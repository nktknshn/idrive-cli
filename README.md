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
  idrive init                    Init new session
  idrive auth                    Authenticate a session
  idrive ls [paths..]            List files in a folder
  idrive mkdir <path>            Create a folder
  idrive cat <path>              View the content of a text file
  idrive edit <path>             Edit a text file
  idrive mv <srcpath> <dstpath>  Move or rename a file or a folder
  idrive rm [paths..]            Remove files and folders
  idrive download <paths..>      Download a file or a folder
  idrive upload <paths..>        Upload files and folders
  idrive recover <path>          Recover a file from the trash
  idrive autocomplete <path>     Autocomplete path

Options:
      --help          Show help                                        [boolean]
      --version       Show version number                              [boolean]
      --session-file  Session file
      --cache-file    Cache file
      --no-cache      Disable cache                   [boolean] [default: false]
  -a, --api-usage     API usage strategy
          [string] [choices: "onlycache", "fallback", "validate", "o", "f", "v"]
                                                           [default: "validate"]
  -d, --debug                                         [boolean] [default: false]
```

### init

Initializes new session. 

`idrive init`

`idrive init --session-file myicloud.json`

Do not login, just create the session file.

`idrive init --skip-login`

Authenticate the session file

`idrive auth`

`idrive auth --session-file myicloud.json`

Use `ICLOUD_SESSION_FILE` environment variable to specify the session file

`export ICLOUD_SESSION_FILE=~/.config/idrive/icloud-session.json`

### ls

List directory contents. Supports globs

`idrive ls`

`idrive ls /MyNotes/my1/`

`idrive ls '/MyNotes/my1/*.md'`

`idrive ls -l '/Camera/*.{png,PNG,jpg}'`

Multiple paths

`idrive ls /MyNotes/ '/Camera/*.jpg' /Pages/Report.pages`

More verbose output (adds size, date, item type)

`idrive ls -l /MyNotes/my1/`

More verbose output (adds drivewsid, etag)

`idrive ls -ll /MyNotes/my1/`

Print folder or file info

`idrive ls -i /MyNotes/my1/ '/Camera/IMG_0198.jpg'`

Print full paths

`idrive ls -f /MyNotes/my1/`

Human readable sizes

`idrive ls -lh /MyNotes/my1/`

Sorting

`idrive ls -S size /`

`idrive ls -S date /`

Recursive listing (may take some time to process deep trees). Note: the command below will save the whole tree into the cache

`idrive ls -R /`

`idrive ls -R / /Obsidian`

Use recursive flag for the globstar pattern

`idrive ls -R '/MyNotes/my1/**/*.md'`

Limit the depth of recursion

`idrive ls -R -D 2 '/MyNotes/my1/**/*.md'`

Sort by size recursively looking for the largest files

`idrive ls -S size -R -h /`

Output result as a tree

`idrive ls -R -D 2 --tree /MyNotes/my1/`

`idrive ls -R --tree '/MyNotes/my1/**/*.md'`

Search in the cache (will fail if the cache is not enough to fulfill the request)

`idrive ls -R '/**/*.md' -a onlycache`

Search in the cache and fall back to the API if the cache is not enough

`idrive ls -R '/**/*.md' -a fallback`

Same for trash

`idrive ls --trash ...`

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

Remove from trash (forever)

`idrive rm --trash /file.txt`

### cat <path>

View the content of a text file

`idrive cat '/MyNotes/my1/note.md'`

### mv <srcpath> <dstpath>

Move or rename a file or a folder. You cannot move between different zones (e.g. between APP_LIBRARIES and Docws)

Remote file will be renamed

`idrive mv /MyNotes/my1/note1.md /MyNotes/my1/note2.md`

Remote file will be moved and renamed

`idrive mv /MyNotes/my1/note1.md /MyNotes/old/note2.md`

Remote file will be moved

`idrive mv /MyNotes/my1/note1.md /MyNotes/note1.md`

<!-- 
### cp <srcpath> <dstpath> 
TODO not implemented. Note: currently file cloning fails with 500 error in the official web client
-->

### recover

Recover a file from the trash

`idrive recover '/note1.md'`

### mkdir <path>

Creates a folder

`idrive mkdir /MyNotes/my1/notes/`

### edit

Editing works by downloading the file to a temporary file and uploading it back. It seems there is no way to overwrite remote file, so the remote file will be removed before uploading.

Opens the file in `vi`. If the file is not found, it will be created.

`idrive edit /MyNotes/my1/notes/note1.md` 

Opens the file in a different editor (defaults to `vi`)

`idrive edit --editor subl /MyNotes/my1/notes/note1.md`

`idrive edit /Camera/IMG_0205.PNG --editor gimp`

### download <remotepath> <localpath>

Download a file or a folder content.

A single file

`idrive download /MyNotes/my1/note1.md outputdir/`

`idrive download /MyNotes/my1/note1.md outputdir/different_name.md`

Multiple files

`idrive download /MyNotes/my1/note1.md /MyNotes/my1/note2.md /Camera/IMG_0198.jpg outputdir/`

Files from a folder

`idrive download /MyNotes/my1/ outputdir/`

`idrive download /MyNotes/my1/\*.md outputdir/`

`idrive download '/Camera/*.{png,PNG,jpg}' outputdir/`

Do not update atime and mtime of the files (by default they are updated to what remote files have)

`idrive download -T /MyNotes/my1/note1.md outputdir/`

Skip downloading files with the same size and date

`idrive download -S /MyNotes/my1/note1.md outputdir/`

Overwrite existing local files without asking

`idrive download -o /MyNotes/my1/note1.md outputdir/`

Skip downloading existing local files without asking

`idrive download -s /MyNotes/my1/note1.md outputdir/`

Do not ask for the last confirmation

`idrive download -N /MyNotes/my1/note1.md outputdir/`

Verbose output

`idrive download -v /MyNotes/my1/note1.md outputdir/`

Dry run

`idrive download --dry /MyNotes/my1/note1.md outputdir/`

Recursively download folders.

`idrive download -R /MyNotes/my1/ outputdir/`

This will download into `outputdir/MyNotes/my1/`

`idrive download -RF /MyNotes/my1/ outputdir/`

Limit the depth of recursion

`idrive download -R -D 2 /MyNotes/my1/ outputdir/`

Globstar pattern is supported

`idrive download -R '/MyNotes/my1/diary/**/*.md' outputdir/`

`include` and `exclude` flags can be used to filter files (supports globs)

`idrive download -R '/MyNotes/my1/diary/**/*.md' --exclude '**/2023*.md' --include '**/2023-12*.md' outputdir/`

Use `dry` flag to only check what is going to be downloaded.

`idrive download -R '/MyNotes/ --dry`

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

### autocomplete <path>

Autocomplete path. Used for shell autocompletions.

Select files

`idrive autocomplete --file /`

Select folders

`idrive autocomplete --dir /`

From trash

`idrive autocomplete --trash /`

Use cache (faster but not always up to date)

`idrive autocomplete -a onlycache /`

### API/cache usage strategy

`--api-usage validate`

Default behaviour. Always validates cached paths by retrieving them from API.

`--api-usage onlycache`

Will not use the API. Only retrieve from cache.

`--api-usage fallback`

Retrieves from API if the cache is not enough.

## Known issues

- state/session is not saved if an error is thrown in SRTE chain

## TODO

- [ ] better ls JSON output
- [ ] cp
- [ ] better/more shell autocompletions