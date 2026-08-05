# Contexte projet — Revue quotidienne audio

Tu prends le relais d'une session Cowork. Tom (auteur, prénom à ne JAMAIS utiliser dans l'audio) a une revue quotidienne audio personnelle, lue par Azure TTS Vivienne et publiée comme podcast privé via flux RSS.

## Architecture

Pipeline GitHub Actions cron 05:30 UTC chaque jour (`b3661555-stack/revue-quotidienne` → `.github/workflows/daily.yml`) :

1. PubMed E-utilities → 4 domaines (big5, hypoxie, sport, IA santé)
2. Google Gemini 2.5-flash (migré depuis Anthropic) + web_search → script `revue_YYYY-MM-DD.txt` avec 7 sections balisées
3. **Deux variantes générées en parallèle depuis le même texte source** :
   - `text_full` = toutes les sections (version privée complète, inclut la thématique IA)
   - `text_general` = sous-ensemble `SECTIONS_GENERAL` (version partageable raccourcie, sans IA)
4. Azure Speech TTS Vivienne Multilingual → 2 MP3 chunkés synthétisés en parallèle (ThreadPoolExecutor), concat ffmpeg
5. Cloudflare R2 → upload des 2 MP3 + 2 textes + sources + 2 feeds RSS
6. WebSub ping (pubsubhubbub) → notifie Spotify/Apple Podcasts/Overcast pour les 2 feeds
7. Slack webhook → DM avec 4 liens (2 MP3 + 2 feeds)

Le code est dans `cloud-pipeline/src/`. Le SKILL.md à la racine est la spec éditoriale lue au runtime par `writer.py`.

`tts.py` nettoie les caractères markdown (`*`, `_`, `~`, backtick) au début de `synthesize()` via `_sanitize_for_speech()` pour qu'Azure ne les lise pas littéralement. Les puces `- ` et `1. ` en début de ligne sont conservées (pauses naturelles).

## Statut actuel (29 mai 2026)

- ✅ Pipeline GitHub Actions en production, deux flux RSS actifs (full + general)
- ✅ Bascule Anthropic → Google Gemini effectuée
- ✅ Fix sanitize markdown pour TTS appliqué le 29 mai
- ✅ Setup local Mac (launchd, ~/Code/daily-briefing/, copie OneDrive /news/) supprimé le 29 mai
- ⏳ Refonte de la maturité éditoriale pour partage institutionnel à venir

## Pipeline actuel — IMPORTANT pour les sessions futures

**Le seul pipeline actif est GitHub Actions** sur `b3661555-stack/revue-quotidienne`, branche `main`.

Tout setup local Mac (launchd, `~/Code/daily-briefing/`, `.command` scripts, copie OneDrive `/news/`) a été supprimé. Ne jamais les diagnostiquer ni les relancer.

Si Tom signale "pas d'épisode aujourd'hui" ou "pipeline cassé" :
1. `gh run list --repo b3661555-stack/revue-quotidienne --limit 5` — voir les derniers runs
2. Chercher un run avec `event=schedule` et `conclusion=failure` (ou absent si runner indispo)
3. `gh run view <id> --log-failed` — lire l'erreur
4. Corriger et relancer : `gh workflow run "Daily Review Pipeline" --repo b3661555-stack/revue-quotidienne`

Causes d'échec connues :
- **LLM Overloaded (Gemini 429 ou 503)** : retry automatique implémenté dans writer.py (backoff exponentiel)
- **GitHub runner indispo** : relancer manuellement, rien à corriger dans le code

## Préférences éditoriales (gravées dans SKILL.md)

- Tout en français, 7 sections (actualités générales, science générale Big 5, hypoxie clinique, sciences du sport, IA santé, …)
- Pas de prénom dans l'audio
- **Pas de mention orale des sources** (publiées séparément en .md sur R2)
- Durée < 10 min, cible 6500-7500 caractères
- Vitesse Vivienne native (PROSODY_RATE=0%)
- 1-2 articles max par section scientifique, uniquement si breaking
- Big 5 = Nature, Science, Cell, Lancet, NEJM

## Préférences de communication avec Tom

- Réponses en français
- Reasoning thorough, pas de brièveté gratuite
- Éviter les em-dashes
- Ne JAMAIS l'appeler "Brad" (le SKILL.md initial avait ce prénom mais c'est faux et il l'a corrigé)
- Une commande à la fois quand on est en debug terminal, pas de blocs multi-lignes

## Endpoints / URLs clés

- Repo : https://github.com/b3661555-stack/revue-quotidienne
- R2 public : https://pub-4e47811542814ba8968455b8254c9609.r2.dev
- Feed RSS privé (full) : `feed.xml`
- Feed RSS partageable (general) : voir `feed.feed_filename("general")`
- Spotify show ID : `1UltszWYJobtP5ZVm5ufTM`
- Slack DM : webhook configuré (jamais loggé)

## Fichiers et structure

```
revue-quotidienne/
├── .github/workflows/daily.yml         cron 05:30 UTC
├── .gitignore                          racine
├── SKILL.md                            spec éditoriale, lue par writer.py
├── CLAUDE.md                           ce fichier
└── cloud-pipeline/
    ├── .env.example                    template
    ├── README.md                       setup complet
    ├── requirements.txt
    ├── setup-github-secrets.sh         pousse .env → GitHub Secrets
    ├── assets/
    │   ├── feed_template.xml
    │   ├── cover.png                   cover full
    │   └── cover-general.png           cover général
    ├── scripts/
    └── src/
        ├── main.py                     orchestrateur, génère les 2 variantes
        ├── pubmed.py
        ├── writer.py                   Gemini + web_search + sections
        ├── tts.py                      Azure + sanitize markdown
        ├── storage.py                  boto3 R2, support 2 prefixes
        ├── feed.py                     2 templates RSS (full + general)
        ├── notify.py                   Slack webhook
        └── dates.py                    validation dates
```

## Commandes utiles

```bash
# Test local complet (depuis le clone)
cd cloud-pipeline
source .venv/bin/activate
python -m src.main

# Re-config GitHub secrets après modif .env
./setup-github-secrets.sh

# Trigger run manuel + watch
gh workflow run "Daily Review Pipeline" --repo b3661555-stack/revue-quotidienne
gh run watch

# Voir les logs d'un run passé
gh run view --log

# Modifier la voix sans toucher au code
gh variable set PROSODY_RATE --body "-10%"
gh variable set AZURE_VOICE_NAME --body "fr-FR-RemyMultilingualNeural"
```

## Coût mensuel estimé

~1 USD/mois total : LLM ~1 USD, Azure 0 USD (free tier F0), Cloudflare R2 0 USD (sous 10 Go), GitHub Actions 0 USD (sous 2000 min), Slack 0 USD.
