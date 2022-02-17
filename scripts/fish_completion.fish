function __fish_autocomplete_file_or_dir
  set -l pattern (commandline -ct)
  set -l comps (idrive autocomplete -d $pattern)

  echo $comps | string replace -a ' ' \n

end

function __fish_autocomplete_file
  set -l pattern (commandline -ct)
  set -l comps (idrive autocomplete -df $pattern)

  echo $comps | string replace -a ' ' \n

end

complete -c idrive -e

set -l idrive_commands ls cat mkdir rm mv upload 

complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a ls -d 'list'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a cat -d 'cat'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mkdir -d 'mkdir'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a rm -d 'rm'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a mv -d 'mv'
complete --no-files -c idrive -n "not __fish_seen_subcommand_from $idrive_commands" -a upload -d 'upload'

complete --no-files -c idrive -n "__fish_seen_subcommand_from ls" -a "(__fish_autocomplete_file_or_dir)"
complete --no-files -c idrive -n "__fish_seen_subcommand_from cat" -a "(__fish_autocomplete_file_or_dir)"