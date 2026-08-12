#!/bin/bash

set -eo pipefail

function bootcmd() {
  printf "\n"
  toilet -f term -t -F border:metal "$1"
  printf "+ $2\n"
}

MARKER_FILE=".devcontainer/.bootdone"

if [ -f "${MARKER_FILE}" ]; then
  source "${MARKER_FILE}"
fi

# Per-user shared volume (skyltmax-dc template), reachable at the same path as on the host.
if [ -d "/home/$HOSTLOGNAME/shared" ]; then
  ln -sfn "/home/$HOSTLOGNAME/shared" /home/vscode/shared
fi

if [ -d "/home/$HOSTLOGNAME/.config" ]; then
  sudo chown -R vscode:vscode /home/$HOSTLOGNAME/.config
fi

# Commit signing config written by the Coder template on the workspace host (home.sh in
# skyltmax/infra); the key path inside it resolves in-container through the host-home bind.
# Inert when absent — git skips missing [include] paths (the dotfiles .gitconfig carries the include).
if [ -f "/home/$HOSTLOGNAME/.config/git/coder-signing" ]; then
  mkdir -p /home/vscode/.config/git
  cp "/home/$HOSTLOGNAME/.config/git/coder-signing" /home/vscode/.config/git/coder-signing
fi

git config --global --add safe.directory $DEVC_WORKSPACE

# npm credentials are written to the workspace host home by the Coder template (skyltmax-dc)
# and reach us through the host-home bind mount. Every dependency here resolves from the public
# registry, so this is only for publishing and for private packages added later — install does
# not depend on it.
if [ -f "/home/$HOSTLOGNAME/.npmrc" ]; then
  cp "/home/$HOSTLOGNAME/.npmrc" "${DEVC_WORKSPACE}/.npmrc"
fi

if [ "${PNPM_ALREADY_INSTALLED_2}" != "true" ]; then
  rm -rf $DEVC_WORKSPACE/node_modules
  bootcmd "Installing NPM packages for workspace" "pnpm install"

  PNPM_ALREADY_INSTALLED_2="true"
fi

if [ "${CHANGELOG_DISPLAYED_26}" != "true" ]; then
  if [ -f "/var/lib/smdevc/changelog" ]; then
    printf "\n"
    toilet -f term -t -F border:metal "Latest Changes"
    cat /var/lib/smdevc/changelog
  fi

  CHANGELOG_DISPLAYED_26="true"
fi

echo -e "\
  PNPM_ALREADY_INSTALLED_2=${PNPM_ALREADY_INSTALLED_2}\n\
  CHANGELOG_DISPLAYED_26=${CHANGELOG_DISPLAYED_26}" > "${MARKER_FILE}"

printf "\n\n\e[38;2;252;163;17m"
toilet -f standard "Remix Base"
printf "\nEnvironment prepared! Get ready to code!\n\n"
printf "\e[0m"
