# Unofficial ICLoud drive cloud built on icloud.com/drive API

## TODO:
- verify extension before uploading to APP_LIBRARY
- upload multiple files
- download file
- download folder
- upload folder

- overwrighting upload
- TRASH

## Usage
```Commands:
  cli-drive.js ls [paths..]                 list files in a folder
  cli-drive.js mkdir <path>                 mkdir
  cli-drive.js rm [paths..]                 check updates
  cli-drive.js cat <path>                   cat
  cli-drive.js mv <srcpath> <dstpath>       move
  cli-drive.js upload <srcpath> <dstpath>   upload
  cli-drive.js uploads <uploadsargs..>      uploads
  cli-drive.js autocomplete <path>          autocomplete
  cli-drive.js download <path> <dstpath>    download
  cli-drive.js df <path> <dstpath>          df
  cli-drive.js uf <localpath> <remotepath>  uf
  cli-drive.js init                         init
  cli-drive.js edit <path>                  edit

Options:
      --version                 Show version number                    [boolean]
  -s, --sessionFile, --session               [default: "data/last-session.json"]
  -c, --cacheFile, --cache                [default: "data/cli-drive-cache.json"]
  -n, --noCache                                       [boolean] [default: false]
  -r, --raw                                           [boolean] [default: false]
  -d, --debug                                         [boolean] [default: false]
  -u, --update                                        [boolean] [default: false]
      --help                    Show help                              [boolean]
```

### init

Initializes new session. 

`idrive init`

`idrive init -s myicloud.json`

`idrive init --skipLogin`

Do not login, just create the session file.

### ls

List files in folders. Supports globs

`idrive ls '/Obsidian/my1/'`

`idrive ls '/Obsidian/my1/*.md'`

List files

`idrive ls -R '/Obsidian/my1/**/*.md'`

Use recursive flag for the globstar pattern (may take some time to process deep trees)

`idrive ls -R --depth 2 '/Obsidian/my1/**/*.md'`

Limit depth of the recursion

`idrive ls /Obsidian/ '/Camera/*.jpg' /Pages/Стильный\ отчет.pages`

Multiple paths

`idrive ls -R --depth 2 --tree '/Obsidian/my1/'`

Output result as a tree

<!-- `idrive ls -R --cached`

??? -->

`idrive ls -t`

list trash

`idrive ls -t -R`

???

### rm [paths..]

Removes files and folders. Supports globs. By default moves files to the trash

`idrive rm '/Obsidian/my1/*.md' /Camera/IMG_0198.jpg`

Multiple paths

`idrive rm -R '/Obsidian/my1/**/*.md'`

Use recursive flag for the globstar pattern

`idrive rm -R '/Obsidian/my1/**/*.md' --dry`

Use recursive flag for the globstar pattern

`idrive ls -R --depth 2 '/Obsidian/my1/**/*.md'`

???

`idrive rm --skipTrash /Camera/IMG_0198.jpg`

Delete file skipping trash

`idrive rm --force /Camera/IMG_0198.jpg`

Do not ask for the confirmation

### cat <path>

View the content of file

`idrive cat '/Obsidian/my1/note.md'`

### mv <srcpath> <dstpath>

Move or rename a file or a folder. You cannot move between different zones

`idrive mv /Obsidian/my1/note1.md /Obsidian/my1/note2.md`

Remote file will be renamed

`idrive mv /Obsidian/my1/note1.md /Obsidian/old/note2.md`

Remote file will be moved and renamed

`idrive mv --force /Obsidian/my1/note1.md /Obsidian/my1/note2.md`

???

### mkdir <path>

Creates a folder

### edit

### upload 

`upload ~/Documents/note1.md /Obsidian/my1/notes/`

`upload ~/Documents/note1.md /Obsidian/my1/notes/note.md`

`upload ~/Documents/note1.md ~/Documents/note2.md ~/Documents/note3.md /Obsidian/my1/notes/`

`upload -R ~/Documents/ /Obsidian/my1/notes/`

`upload -R '~/Documents/**/*.md' /Obsidian/my1/notes/`

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

Download a file or a folder.

`idrive download '/Obsidian/my1/note1.md' ./outputdir`

`idrive download '/Obsidian/my1/*.md' ./outputdir`

`idrive download -R '/Obsidian/my1/' ./outputdir`

Recursively download into `./outputdir/my1/`

`idrive download -R '/Obsidian/my1/diary/**/*.md' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/` 

`idrive download -RS '/Obsidian/my1/diary/**/*.md' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`

Use `dry` flag to only check what is going to be downloaded

` include` and `exclude` flags are also supported

### recover

### autocomplete <path>

Autocomplete path. Used for shell autocompletions.

