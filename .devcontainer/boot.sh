#!/bin/bash

set -eo pipefail

MARKER_FILE=".devcontainer/.bootdone"

if [ -f "${MARKER_FILE}" ]; then
  source "${MARKER_FILE}"
fi

git config --global --add safe.directory $DEVC_WORKSPACE

if [ "${PNPM_ALREADY_INSTALLED_2}" != "true" ]; then
  rm -rf $DEVC_WORKSPACE/node_modules

  PNPM_ALREADY_RESET_2="true"
fi

if [ "${CHANGELOG_DISPLAYED_36}" != "true" ]; then
  if [ -f "/var/lib/smdevc/changelog" ]; then
    printf "\n"
    toilet -f term -t -F border:metal "Latest Changes"
    cat /var/lib/smdevc/changelog
  fi

  CHANGELOG_DISPLAYED_36="true"
fi

echo -e "\
  PNPM_ALREADY_INSTALLED_2=${PNPM_ALREADY_INSTALLED_2}\n\
  CHANGELOG_DISPLAYED_36=${CHANGELOG_DISPLAYED_36}" > "${MARKER_FILE}"

printf "\n\n\e[38;2;252;163;17m"
toilet -f standard "Remix Base"
printf "\nEnvironment prepared! Get ready to code!\n\n"
printf "\e[0m"
