#!/usr/bin/env bash
# Executa uma suíte mobile dentro do emulador da CI, guardando o logcat.
# Uso: run-mobile-suite.sh <smoke|regression|spec:NOME>
set -uo pipefail

TARGET="${1:?informe a suíte}"
RESULTS_DIR="apps/mobile-e2e/test-results"
# Teto de segurança: se o emulador travar, a suíte não segura o runner até o timeout do job.
SUITE_TIMEOUT="${SUITE_TIMEOUT:-40m}"

mkdir -p "$RESULTS_DIR"

adb wait-for-device
# Espera o Android ligar, reinicia uma vez se ele não ficar saudável e aplica os
# ajustes de estabilidade (resolução menor, animações desligadas, diálogos do
# sistema fechados). Sem emulador saudável, nem começa: sai com 3 (device offline).
node apps/mobile-e2e/scripts/prepare-ci-emulator.mjs || exit 3
adb logcat -c || true
adb logcat -v time > "$RESULTS_DIR/logcat.txt" 2>&1 &
LOGCAT_PID=$!

case "$TARGET" in
  smoke | regression)
    timeout "$SUITE_TIMEOUT" npm run "suite:$TARGET" -w mobile-e2e
    ;;
  spec:*)
    spec="${TARGET#spec:}"
    if [[ ! "$spec" =~ ^[a-z-]+$ ]]; then
      echo "::error::nome de spec inválido: $spec"
      exit 1
    fi
    timeout "$SUITE_TIMEOUT" npm run "spec:$spec" -w mobile-e2e
    ;;
  *)
    echo "::error::alvo desconhecido: $TARGET"
    exit 1
    ;;
esac
STATUS=$?

kill "$LOGCAT_PID" 2>/dev/null || true
if [[ $STATUS -eq 124 ]]; then
  echo "::error::suíte excedeu $SUITE_TIMEOUT e foi interrompida"
fi
exit $STATUS
