#!/bin/bash

set -e

if [ -f "/home/$HOSTLOGNAME/.ssh/id_rsa.pub.sign" ]; then
  ln -sf /home/$HOSTLOGNAME/.ssh/id_rsa.pub.sign /home/vscode/.ssh/id_rsa.pub.sign
fi

git config --global --add safe.directory $DEVC_WORKSPACE

function bootcmd() {
  printf "\n"
  toilet -f term -t -F border:metal "$1"
  printf "+ $2\n"
}

MARKER_FILE=".devcontainer/.bootdone"

if [ -f "${MARKER_FILE}" ]; then
  source "${MARKER_FILE}"
fi

if [ "${CHANGELOG_DISPLAYED_6}" != "true" ]; then
  if [ -f "/var/lib/smdevc/changelog" ]; then
    printf "\n"
    toilet -f term -t -F border:metal "Latest Changes"
    cat /var/lib/smdevc/changelog
  fi

  CHANGELOG_DISPLAYED_6="true"
fi

echo -e "\
  CHANGELOG_DISPLAYED_6=${CHANGELOG_DISPLAYED_6}" > "${MARKER_FILE}"

printf "\n\n\e[38;2;252;163;17m"
toilet -f standard "Remix Base"
printf "\nEnvironment prepared! Get ready to code!\n\n"
printf "\e[0m"
