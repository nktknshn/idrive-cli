# basic fish completion for idrive

function __fish_autocomplete_path
  argparse 't/trash' 'f/file' 'd/dir' -- $argv

  set -l ac_args

  set -l _cmd (commandline)

  # argparse -i 'a/api-usage=' -- $_cmd
  # no result appears in flags

  #  idk why but only this way it works
  set -l _cmd1 "argparse -i 'a/api-usage=' -- $_cmd"
  eval $_cmd1

  if not test -z "$_flag_api_usage"
      set ac_args $ac_args --api-usage $_flag_api_usage
  end

  if not test -z "$_flag_trash"
    set ac_args $ac_args --trash
  end

  if not test -z "$_flag_file"
    set ac_args $ac_args --file
  end

  if not test -z "$_flag_dir"
    set ac_args $ac_args --dir
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


# remove old completions
complete -c idrive -e

set -l idrive_commands ls cat mkdir upload rm mv recover download edit init auth

complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a ls -d 'list'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a cat -d 'cat'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a edit -d 'edit'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mkdir -d 'mkdir'

complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a rm -d 'rm'
 
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mv -d 'mv'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a upload -d 'upload'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a edit -d 'edit'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a download -d 'download'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a recover -d 'recover'

# ls
complete --no-files -c idrive -n "__fish_seen_subcommand_from ls; and not __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path)"
complete --no-files -c idrive -n "__fish_seen_subcommand_from ls; and __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path --trash)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from cat" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from edit" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from mkdir" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from rm; and not __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path)"
complete --no-files -c idrive -n "__fish_seen_subcommand_from rm; and __fish_seen_argument -s t -l trash" -a "(__fish_autocomplete_path --trash)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from download" -a "(__fish_autocomplete_path)"

complete --no-files -c idrive -n "__fish_seen_subcommand_from recover" -a "(__fish_autocomplete_path --trash)"

# upload
complete -c idrive -n "__fish_seen_subcommand_from upload; and __fish_first_arg"
complete --no-files -c idrive -n "__fish_seen_subcommand_from upload; and __fish_second_arg" -a "(__fish_autocomplete_path)"

# mv
complete --no-files -c idrive -n "__fish_seen_subcommand_from mv; and __fish_first_arg" -a "(__fish_autocomplete_path)"
complete --no-files -c idrive -n "__fish_seen_subcommand_from mv; and __fish_second_arg" -a "(__fish_autocomplete_path)"