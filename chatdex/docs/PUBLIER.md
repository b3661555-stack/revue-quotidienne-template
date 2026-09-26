# Publier Chatdex sur Render, l'App Store et le Play Store

Ordre obligatoire : **1. serveur en ligne → 2. Android → 3. iOS**. Les apps ne sont qu'une coquille qui parle au serveur.

Coûts : Render ~7 $/mois (instance Starter + disque 1 Go), Apple 99 $/an, Google 25 $ une fois.

---

## 1. Mettre le serveur en ligne (Render, ~15 min)

1. Crée un compte sur https://render.com (connexion avec GitHub).
2. Fusionne la PR dans `main` (le fichier `render.yaml` à la racine du dépôt décrit tout le service).
3. Render → **New** → **Blueprint** → choisis le dépôt `revue-quotidienne-template` → **Apply**.
4. Attends le premier déploiement (~5 min). Tu obtiens une adresse du type `https://chatdex-xxxx.onrender.com`.
5. Ouvre-la sur ton téléphone : l'app web marche déjà (caméra et GPS inclus grâce au HTTPS).
6. Mets ton e-mail de contact dans `chatdex/public/privacy.html` (deux endroits surlignés en jaune), puis pousse : Render redéploie tout seul.
7. Quand de vrais joueurs arrivent : dans Render → Environment, passe `DEMO_DATA` à `false`, puis lance `npm run demo:clear` depuis le **Shell** Render.

Sauvegardes : la base est le fichier `/var/data/chatdex.db`. Active les snapshots du disque dans Render (Disks → Snapshots).

## 2. Brancher les apps sur ton serveur

Dans GitHub → dépôt → **Settings → Secrets and variables → Actions → Variables** → **New variable** :
- Nom : `CHATDEX_API_URL`
- Valeur : l'adresse Render, par ex. `https://chatdex-xxxx.onrender.com`

À chaque push, GitHub Actions compile l'app Android (onglet **Actions** → « Chatdex mobile builds » → artefact `chatdex-debug-apk`). Tu peux installer cet APK sur un téléphone Android pour tester avant de publier.

## 3. Android → Google Play (~1 h + validation 1 à 7 jours)

1. Crée un compte sur https://play.google.com/console (25 $, pièce d'identité demandée).
2. Change l'identifiant de l'app si tu veux (`com.chatdex.app` dans `chatdex/capacitor.config.json` et `android/app/build.gradle`). Il est définitif après la première publication.
3. Sur un ordinateur avec **Android Studio** :
   ```bash
   cd chatdex
   npm install
   CHATDEX_API_URL=https://chatdex-xxxx.onrender.com npm run build:mobile
   npm run cap:android
   ```
4. Dans Android Studio : **Build → Generate Signed App Bundle** → crée une clé de signature (**garde-la précieusement** : sans elle, plus de mise à jour possible) → fichier `.aab`.
5. Play Console → Créer l'application → remplis la fiche avec `docs/fiches-stores.md` → envoie le `.aab` en **Test interne** d'abord, puis en **Production**.
6. Formulaires obligatoires dans la Play Console :
   - **Sécurité des données** : e-mail, photos, position approximative, collectées ; non partagées ; suppression possible dans l'app.
   - **Politique de confidentialité** : `https://chatdex-xxxx.onrender.com/privacy.html`
   - **Classification du contenu** : questionnaire (contenu généré par les utilisateurs : oui, avec signalement).
   - **Public cible** : 13 ans et plus.
   - Nouveau compte personnel : Google exige un **test fermé avec 12 testeurs pendant 14 jours** avant la production.

## 4. iPhone → App Store (~2 h + validation 1 à 3 jours)

1. Il faut un **Mac** avec **Xcode** (gratuit sur le Mac App Store).
2. Crée un compte sur https://developer.apple.com/programs (99 $/an).
3. Sur le Mac :
   ```bash
   cd chatdex
   npm install
   CHATDEX_API_URL=https://chatdex-xxxx.onrender.com npm run build:mobile
   npm run cap:ios
   ```
4. Dans Xcode : cible **App** → **Signing & Capabilities** → choisis ton équipe (Team) ; change le Bundle Identifier si `com.chatdex.app` est pris.
5. Teste sur ton iPhone (branche-le, choisis-le en haut, ▶︎).
6. **Product → Archive** → **Distribute App** → **App Store Connect**.
7. Sur https://appstoreconnect.apple.com : crée l'app, remplis la fiche avec `docs/fiches-stores.md`, ajoute les captures (6,7" et 6,5"), la politique de confidentialité, puis **Soumettre pour vérification**.
8. **Confidentialité de l'app** (App Store Connect) : données liées à l'utilisateur = e-mail, photos, position approximative, contenu généré ; pas de pistage.
9. Compte de démo pour l'équipe Apple (champ « Sign-in information ») : `demo@chatdex.app` / `chatdex` (garde `DEMO_DATA=true` pendant la vérification).

### Points que la vérification Apple regarde (déjà traités)
- Suppression de compte dans l'app : Profil → ⚙️ → Supprimer mon compte ✅
- Signalement de contenu et d'utilisateurs ✅
- Textes d'autorisation caméra / photos / position, en 15 langues ✅
- Politique de confidentialité accessible dans l'app et en ligne ✅
- Règle 4.2 (« app trop proche d'un site web ») : l'interface est embarquée dans l'app, avec caméra, position, bouton retour natif. Si Apple la refuse quand même, les pistes sont : notifications push, widget, partage natif.

## Mettre à jour les apps plus tard
1. Modifie le code, pousse sur `main` : le serveur Render se met à jour seul.
2. Pour les apps : augmente `versionCode`/`versionName` (Android, `android/app/build.gradle`) et la version dans Xcode, relance `npm run build:mobile`, puis refais l'étape 4 (Android) ou 6 (iOS).
