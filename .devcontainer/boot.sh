#!/bin/bash

aws sts get-caller-identity &> /dev/null
AWS_EXIT_CODE="$?"
if [ $AWS_EXIT_CODE != 0 ]; then
  printf "\n\n\e[38;2;252;163;17m"
  printf "\n🫨  Valid AWS SSO token not found. Your AWS SSO session may have expired.\nEnsure you have configured AWS SSO and run \e[92;1maws sso login\e[0m\e[38;2;252;163;17m. Then rebuild this devcontainer again\n\n"
  printf "\e[0m"
  exit 0
fi

set -e

if [ -f "/home/$HOSTLOGNAME/.ssh/id_rsa.pub.sign" ]; then
  ln -sf /home/$HOSTLOGNAME/.ssh/id_rsa.pub.sign /home/vscode/.ssh/id_rsa.pub.sign
fi

git config --global --add safe.directory $DEVC_WORKSPACE

# Populate workspace .npmrc from AWS Secrets Manager (secret name: npmrc)
if SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id npmrc --query SecretString --output text 2> /dev/null); then
  if [ "${SECRET_VALUE}" != "None" ]; then
    printf "%s" "${SECRET_VALUE}" > "${DEVC_WORKSPACE}/.npmrc"
  else
    printf "\n[warn] npmrc secret contains no SecretString value\n"
  fi
else
  printf "\n[warn] Unable to fetch npmrc secret; continuing without updating .npmrc\n"
fi

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
