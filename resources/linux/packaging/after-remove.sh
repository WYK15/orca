#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into an Orcaw install dir — never delete an unrelated command.
set -e

link="/usr/bin/orcaw-ide"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/Orcaw/*|/opt/orcaw-ide/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
