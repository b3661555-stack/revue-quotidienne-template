# Revue quotidienne — podcast d'actualité auto-généré

Chaque matin, ce pipeline produit un épisode audio de 5 à 10 minutes qui résume :

- l'actualité générale (Monde → Suisse → Vaud → Lausanne — adaptable à votre région) ;
- les découvertes des grandes revues scientifiques (via PubMed) ;
- l'actualité en sciences du sport.

Le ton visé : factuel, nuancé, sans sensationnalisme, avec des nouvelles positives. L'épisode est publié sur un flux RSS que Spotify ou Apple Podcasts lit automatiquement. Coût de fonctionnement : ~0 CHF (niveaux gratuits de chaque service).

## Comment ça marche

1. **GitHub Actions** se déclenche chaque nuit (cron `0 3 * * *` UTC, exécution effective 1 à 3 h plus tard selon la charge GitHub).
2. **PubMed** (E-utilities) fournit les publications récentes.
3. **Gemini** (Google, avec recherche web) rédige le script selon la ligne éditoriale définie dans `SKILL.md`. Deux variantes : complète et généraliste.
4. **edge-tts** (gratuit, voix neuronales Microsoft, ex. `fr-FR-VivienneMultilingualNeural`) synthétise les MP3 ; un jingle est ajouté via ffmpeg.
5. **Cloudflare R2** héberge MP3, textes et les deux flux RSS (`feed.xml` complet, `feed-general.xml` généraliste).
6. WebSub notifie les plateformes ; notifications Slack / WhatsApp optionnelles.

Le script du jour reste lisible en texte : `<R2_PUBLIC_URL>/texts/revue_AAAA-MM-JJ.txt` (et `...-general.txt`).

## Mise en place (~30 min)

### 1. Créer votre copie

Cliquez sur **Use this template** → *Create a new repository* (public ou privé).

### 2. Obtenir les clés

- **Gemini** : créez une clé API gratuite sur [Google AI Studio](https://aistudio.google.com/apikey).
- **Cloudflare R2** : créez un compte Cloudflare → R2 → créez un bucket → *Settings* du bucket → activez l'accès public **r2.dev** (notez l'URL `https://pub-xxxx.r2.dev`) → *Manage R2 API Tokens* → créez un token (lecture/écriture sur le bucket) et notez `Access Key ID`, `Secret Access Key` et `Account ID`.
- **NCBI** (optionnel, recommandé) : clé gratuite pour un débit PubMed accru.

### 3. Configurer le repo

Dans votre repo : **Settings → Secrets and variables → Actions**.

**Secrets** (onglet *Secrets*) :

| Secret | Rôle | Requis |
|---|---|---|
| `GOOGLE_API_KEY` | Rédaction du script (Gemini) | oui |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Upload vers R2 | oui |
| `NCBI_API_KEY` | PubMed | non |
| `SLACK_WEBHOOK_URL` | Notification de l'épisode | non |
| `WHATSAPP_PHONE` + `CALLMEBOT_API_KEY` | Alerte WhatsApp en cas d'échec | non |
| `AZURE_SPEECH_KEY` | Hérité (edge-tts n'en a pas besoin) | non |

**Variables** (onglet *Variables*) :

| Variable | Exemple |
|---|---|
| `R2_BUCKET` | `mon-bucket-podcast` |
| `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` |
| `AZURE_VOICE_NAME` | `fr-FR-VivienneMultilingualNeural` |
| `PROSODY_RATE` | `0%` |
| `PODCAST_TITLE` / `PODCAST_AUTHOR` / `PODCAST_EMAIL` | métadonnées du flux complet |
| `PODCAST_LANGUAGE` / `PODCAST_TIMEZONE` | `fr-FR` / `Europe/Zurich` |
| `PODCAST_DESCRIPTION` | description du flux complet |
| `PODCAST_TITLE_GENERAL` / `PODCAST_AUTHOR_GENERAL` / `PODCAST_DESCRIPTION_GENERAL` | métadonnées du flux généraliste |
| `EPISODE_PREFIX_GENERAL` / `FEED_FILENAME_GENERAL` | `episodes-general/` / `feed-general.xml` |
| `NCBI_TOOL` / `NCBI_EMAIL` | identification auprès de PubMed |
| `SLACK_NOTIFY` | `true` / `false` |
| `AZURE_SPEECH_REGION` | hérité, laissez vide |

Voir aussi `cloud-pipeline/.env.example` pour un lancement local.

### 4. Activer et tester

**Settings → Actions → General** : autorisez les actions. Puis onglet **Actions** → workflow *Daily Review Pipeline* → **Run workflow** pour un test manuel. Vérifiez que `feed.xml` apparaît à `<R2_PUBLIC_URL>/feed.xml`.

### 5. S'abonner

- **Spotify** : [creators.spotify.com](https://creators.spotify.com) → ajouter un podcast via RSS → collez `<R2_PUBLIC_URL>/feed.xml` (ou `feed-general.xml`).
- **Apple Podcasts** : app Podcasts → *Suivre une émission par URL*.

### 6. Personnaliser

- **Ligne éditoriale** (sections, sources, ton, régions) : `SKILL.md`.
- **Requêtes PubMed** (revues et domaines suivis) : `cloud-pipeline/src/pubmed.py`.
- **Pochettes et jingle** : `cloud-pipeline/assets/` (`scripts/generate_cover.py` peut régénérer une pochette).
- **Horaire** : le cron dans `.github/workflows/daily.yml`.

## Structure

```
.github/workflows/daily.yml   le workflow quotidien
SKILL.md                      spécification éditoriale (lue par writer.py)
cloud-pipeline/src/           main.py, writer.py, pubmed.py, tts.py, feed.py, storage.py, notify.py
cloud-pipeline/assets/        pochettes, jingle, gabarits RSS
```

## Limites connues

- edge-tts s'appuie sur un point d'accès non officiel de Microsoft Edge (pas de SLA).
- Le niveau gratuit de Gemini impose des quotas ; le pipeline réessaie en cas de surcharge.
- Respectez les conditions d'utilisation des sources que vous résumez ; l'épisode cite ses sources sans reproduire les articles.
