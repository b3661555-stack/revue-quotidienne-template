# Revue quotidienne — pipeline cloud

Pipeline GitHub Actions qui produit chaque matin un MP3 de la revue quotidienne et le publie via un flux RSS podcast (Apple Podcasts, Spotify, Pocket Casts).

## Architecture

```
GitHub Actions cron 05:30 UTC
        │
        ▼
  ┌────────────┐
  │  main.py   │
  └─────┬──────┘
        │
        ├──► PubMed E-utilities (Big 5, hypoxie, sport, IA santé)
        ├──► Anthropic API (Sonnet + web_search) → revue.txt
        ├──► Azure Speech TTS (Vivienne) → MP3 chunké + concat ffmpeg
        ├──► Cloudflare R2 upload (MP3 + texte + sources + feed.xml)
        └──► Slack webhook notification
                                                │
                                                ▼
                              Apple Podcasts / Spotify lisent feed.xml
                                                │
                                                ▼
                                    iPhone reçoit l'épisode
```

## Composants

| Fichier | Rôle |
|---|---|
| `src/main.py` | Orchestrateur séquentiel des 6 étapes |
| `src/pubmed.py` | Recherche NCBI E-utilities (sans clé API) |
| `src/writer.py` | Appel Anthropic Sonnet avec tool `web_search`, génère le `.txt` final |
| `src/tts.py` | Azure TTS, chunking, concat ffmpeg, retry sur 429 |
| `src/storage.py` | Upload R2 via boto3 (S3-compatible) |
| `src/feed.py` | Génération `feed.xml` depuis le bucket R2 |
| `src/notify.py` | DM Slack via webhook |
| `assets/feed_template.xml` | Template Jinja2 RSS 2.0 + iTunes podcast |
| `.github/workflows/daily.yml` | Cron quotidien GitHub Actions |
| `SKILL.md` | Spec éditoriale (lue par `writer.py` au runtime) |

## Setup en 8 étapes

### 1. Cloudflare R2 (5 min, gratuit jusqu'à 10 Go)

1. Compte Cloudflare → R2 Object Storage → activer
2. Créer un bucket `revue-brad`
3. Aller dans **Settings → Public access** et activer "Allow Access" via le sous-domaine `*.r2.dev`
4. Noter le **Public URL** (ex. `https://pub-abc123.r2.dev`)
5. Créer une API token : **Manage R2 API Tokens** → "Create token", scope "Object Read & Write", apply to specific bucket
6. Noter `Access Key ID`, `Secret Access Key`, `Account ID`

### 2. Anthropic API (2 min)

1. console.anthropic.com → API Keys → Create
2. Mettre 10 USD de crédit
3. Noter la clé `sk-ant-...`

### 3. Slack webhook (3 min)

1. api.slack.com/apps → "Create New App" → "From scratch" → nom `revue-bot`
2. **Incoming Webhooks** → activer → "Add New Webhook to Workspace" → choisir le DM avec toi-même
3. Noter l'URL `https://hooks.slack.com/services/...`

### 4. Repo GitHub (5 min)

1. github.com/new → repo **privé** nommé `revue-quotidienne`
2. Sur ton Mac :
   ```bash
   cd ~/Documents/Claude/Scheduled/revue-quotidienne
   git init && git add cloud-pipeline SKILL.md
   git commit -m "Initial pipeline"
   git remote add origin https://github.com/<toi>/revue-quotidienne.git
   git branch -M main
   git push -u origin main
   ```

### 5. Secrets et variables GitHub

Dans le repo, **Settings → Secrets and variables → Actions** :

**Secrets** (chiffrés, jamais visibles) :
- `ANTHROPIC_API_KEY`
- `AZURE_SPEECH_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `SLACK_WEBHOOK_URL`

**Variables** (visibles, non sensibles) :
- `AZURE_SPEECH_REGION` = `westeurope`
- `AZURE_VOICE_NAME` = `fr-FR-VivienneMultilingualNeural`
- `PROSODY_RATE` = `0%`
- `R2_BUCKET` = `revue-brad`
- `R2_PUBLIC_URL` = ton URL r2.dev (ex. `https://pub-abc123.r2.dev`)
- `PODCAST_TITLE` = `Revue quotidienne`
- `PODCAST_AUTHOR` = `Tom`
- `PODCAST_EMAIL` = ton email
- `PODCAST_LANGUAGE` = `fr-FR`
- `PODCAST_TIMEZONE` = `Europe/Zurich`

### 6. Cover art (1 min, optionnel pour le 1er run)

Crée une image 3000x3000 px PNG, dépose-la dans `cloud-pipeline/assets/cover.png`. Tu peux utiliser une image générée via DALL-E ou un design simple. Upload manuel sur R2 sous la clé `assets/cover.png` (ou ajouter au workflow GitHub Actions).

### 7. Test manuel

Dans GitHub : onglet **Actions** → "Daily Review Pipeline" → bouton **Run workflow** (sur la branche main).

Tu suis les logs en direct. Au bout de 2-3 minutes tu dois voir :
- `[1/6] PubMed... 4 domaines`
- `[2/6] Anthropic draft... revue: ~7000 chars`
- `[3/6] Azure TTS... durée: 7:45`
- `[4/6] Upload R2... MP3 -> https://pub-...`
- `[5/6] Feed RSS... -> https://pub-.../feed.xml`
- `[6/6] Slack...`
- `=== OK ===`

Vérifie le MP3 en cliquant sur l'URL R2.

### 8. Abonnement iPhone

App **Podcasts** d'Apple → Bibliothèque → menu trois points → **Suivre une émission par URL** → colle ton `https://pub-xxx.r2.dev/feed.xml`. Première émission visible immédiatement.

(Optionnel) Pour Spotify : podcasters.spotify.com → "Add or Claim Your Podcast" → soumets la même URL → 24h pour validation.

## Test local

Pour tester sans déployer sur GitHub Actions :

```bash
cd cloud-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # remplir tous les champs
export $(cat .env | xargs)
python -m src.main
```

## Coûts estimés

- Cloudflare R2 : 0 USD (ta consommation est sous le free tier 10 Go)
- Anthropic API : ~0.03 USD/jour avec Sonnet ≈ 1 USD/mois
- Azure Speech : 0 USD (free tier F0 = 500K caractères/mois, tu en consommes ~280K)
- GitHub Actions : 0 USD (~ 90 min/mois sur 2000 min gratuites)
- Slack webhook : 0 USD

**Total : ~1 USD/mois.**

## Rotation des clés

Une fois le pipeline stable, dans le portail Azure :
1. **Keys and Endpoint** → bouton **Regenerate Key 1**
2. Copier la nouvelle KEY 1 dans GitHub Secret `AZURE_SPEECH_KEY`
3. Supprimer le `.env` local sur ton Mac

Idem pour les autres clés à intervalle régulier (tous les 90 jours).

## Désactivation du `.command` local

Une fois le pipeline cloud opérationnel et l'abonnement Apple Podcasts vérifié, tu peux désactiver l'ancienne tâche planifiée Cowork qui lance `generer_revue_mp3.command` localement. Le `.command` reste en place comme fallback manuel si jamais GitHub Actions tombe.
