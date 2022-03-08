function __fish_autocomplete_path
  argparse 't/trash' 'f/file' 'd/dir' 'c/cached' -- $argv
  set -l ac_args

  if not test -z "$_flag_trash"
    set ac_args $ac_args --trash
  end

  if not test -z "$_flag_file"
    set ac_args $ac_args --file
  end

  if not test -z "$_flag_dir"
    set ac_args $ac_args --dir
  end

  if not test -z "$_flag_cached"
    set ac_args $ac_args --cached
  end

  set -l pattern (commandline -ct)
  idrive autocomplete $ac_args (string unescape $pattern)
end

function __fish_first_arg
  set -l tokens (commandline -opc) (commandline -ct)
  set -l command (commandline -opc)

  set -l stipped_args (echo $command | string split ' ' | grep -v -P '^\-')

  test ( count $stipped_args) -eq 2
end

function __fish_second_arg
  set -l tokens (commandline -opc) (commandline -ct)
  set -l command (commandline -opc)

  set -l stipped_args (echo $command | string split ' ' | grep -v -P '^\-')

  test (count $stipped_args) -eq 3
end


complete -c idrive -e

set -l idrive_commands ls cat mkdir upload uploads rm mv recover

complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a ls -d 'list'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a cat -d 'cat'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mkdir -d 'mkdir'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a rm -d 'rm'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mv -d 'mv'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a upload -d 'upload'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a uploads -d 'uploads'

complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a recover -d 'recover'

complete --no-files -c idrive -n "__fish_seen_subcommand_from ls; and not __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from ls; and __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path --trash)"

# complete --no-files -c idrive -n "__fish_seen_subcommand_from ls; and not __fish_seen_argument t" -a "(__fish_autocomplete_file_or_dir_trash)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from cat" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from mkdir" -a "(__fish_autocomplete_path -d)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from rm" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from recover" -a "(__fish_autocomplete_path -t)"

complete -c idrive -n "__fish_seen_subcommand_from upload; and __fish_first_arg"
complete -c idrive -n "__fish_seen_subcommand_from uploads"

complete --no-files -c idrive -n "__fish_seen_subcommand_from upload; and __fish_second_arg" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from mv; and __fish_first_arg" -a "(__fish_autocomplete_path)"
complete --no-files -c idrive -n "__fish_seen_subcommand_from mv; and __fish_second_arg" -a "(__fish_autocomplete_path -d)"