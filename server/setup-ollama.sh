#!/usr/bin/env bash
# Installs Ollama and pulls Mistral for the NoNameQuiz KI-Proxy (F8) on a
# plain Debian machine with no GPU. Ollama falls back to CPU automatically,
# nothing GPU-specific to configure. See README.md for the full deployment
# (this script only covers the model server, not the proxy itself).
#
# Usage: ./setup-ollama.sh [model]   (default model: mistral)
set -euo pipefail

MODEL="${1:-mistral}"

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

if ! command -v curl >/dev/null 2>&1; then
  echo "==> Installing curl"
  run_as_root apt-get update
  run_as_root apt-get install -y curl ca-certificates
fi

echo "==> Installing Ollama"
curl -fsSL https://ollama.com/install.sh | run_as_root sh

echo "==> Enabling and starting the ollama service"
run_as_root systemctl enable --now ollama

echo "==> Waiting for Ollama to accept connections on 127.0.0.1:11434"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:11434/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS http://localhost:11434/ >/dev/null 2>&1; then
  echo "Ollama didn't come up in time — check 'systemctl status ollama'." >&2
  exit 1
fi

echo "==> Pulling model: $MODEL (several GB download, can take a while on CPU-only hardware)"
ollama pull "$MODEL"

echo "==> Verifying the OpenAI-compatible endpoint"
curl -fsS http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Antworte mit einem Wort: Hallo.\"}]}"
echo
echo
echo "==> Done. Ollama is listening on 127.0.0.1:11434 only (not exposed to the network)."
echo "Next: set MISTRAL_BASE_URL=http://localhost:11434/v1 and MISTRAL_MODEL=$MODEL"
echo "in server/.env, then deploy the proxy — see README.md."
