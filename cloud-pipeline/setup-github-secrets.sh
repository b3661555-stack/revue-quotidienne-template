#!/bin/bash
# setup-github-secrets.sh
# Pousse les secrets et variables du .env local vers le repo GitHub courant.
# Prérequis : gh CLI installé et authentifié (gh auth login), repo cloné, .env valide.

set -e
cd "$(dirname "$0")"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERREUR : gh CLI manquant. Installe avec : brew install gh"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERREUR : .env manquant dans $(pwd)"
  exit 1
fi

# Charger le .env (les valeurs avec espaces sont entre guillemets)
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Configuration des SECRETS (chiffrés)..."
gh secret set ANTHROPIC_API_KEY      --body "$ANTHROPIC_API_KEY"
gh secret set AZURE_SPEECH_KEY       --body "$AZURE_SPEECH_KEY"
gh secret set R2_ACCOUNT_ID          --body "$R2_ACCOUNT_ID"
gh secret set R2_ACCESS_KEY_ID       --body "$R2_ACCESS_KEY_ID"
gh secret set R2_SECRET_ACCESS_KEY   --body "$R2_SECRET_ACCESS_KEY"
gh secret set SLACK_WEBHOOK_URL      --body "$SLACK_WEBHOOK_URL"

echo "==> Configuration des VARIABLES (lisibles)..."
gh variable set AZURE_SPEECH_REGION  --body "$AZURE_SPEECH_REGION"
gh variable set AZURE_VOICE_NAME     --body "$AZURE_VOICE_NAME"
gh variable set PROSODY_RATE         --body "$PROSODY_RATE"
gh variable set R2_BUCKET            --body "$R2_BUCKET"
gh variable set R2_PUBLIC_URL        --body "$R2_PUBLIC_URL"
gh variable set PODCAST_TITLE        --body "$PODCAST_TITLE"
gh variable set PODCAST_AUTHOR       --body "$PODCAST_AUTHOR"
gh variable set PODCAST_EMAIL        --body "$PODCAST_EMAIL"
gh variable set PODCAST_LANGUAGE     --body "$PODCAST_LANGUAGE"
gh variable set PODCAST_TIMEZONE     --body "$PODCAST_TIMEZONE"
gh variable set PODCAST_DESCRIPTION  --body "$PODCAST_DESCRIPTION"
gh variable set SLACK_NOTIFY         --body "${SLACK_NOTIFY:-false}"

# --- Flux 2 (public, partageable) ---
gh variable set EPISODE_PREFIX_GENERAL    --body "$EPISODE_PREFIX_GENERAL"
gh variable set FEED_FILENAME_GENERAL     --body "$FEED_FILENAME_GENERAL"
gh variable set PODCAST_TITLE_GENERAL     --body "$PODCAST_TITLE_GENERAL"
gh variable set PODCAST_DESCRIPTION_GENERAL --body "$PODCAST_DESCRIPTION_GENERAL"
gh variable set PODCAST_AUTHOR_GENERAL    --body "$PODCAST_AUTHOR_GENERAL"

echo ""
echo "==> Vérification :"
gh secret list
echo ""
gh variable list
echo ""
echo "==> Done. Tu peux maintenant déclencher le workflow :"
echo "    gh workflow run \"Daily Review Pipeline\""
