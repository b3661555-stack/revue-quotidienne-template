"""Editorial writer: calls Google Gemini with Google Search grounding to draft revue.txt.

Inputs: date, raw PubMed search results
Output: the .txt content (audio script in French, with section markers) and a .md sources file

The model emits the audio script in seven sections separated by
``<!-- SECTION:name -->`` comment markers (intro, actu, big5, hypoxie, sport,
ia, outro). Use :func:`split_sections` to parse and :func:`build_text` to
reassemble an arbitrary subset (e.g. for the public/sharing feed).
"""
from __future__ import annotations

import os
import re
import time
from datetime import date, datetime
from pathlib import Path

from google import genai
from google.genai import types

from src.dates import format_french_date, french_weekday, french_month

MODEL = "gemini-2.5-flash"

# Canonical order of the seven sections emitted by the writer.
SECTIONS_FULL: list[str] = ["intro", "actu", "big5", "hypoxie", "sport", "ia", "outro"]

# Subset retained for the public/sharing feed (flux 2): excludes hypoxie and ia.
SECTIONS_GENERAL: list[str] = ["intro", "actu", "big5", "sport", "outro"]

_SECTION_MARKER_RE = re.compile(
    r"<!--\s*SECTION:([a-zA-Z0-9_-]+)\s*-->", re.IGNORECASE
)

# Number of writer attempts before falling back to placeholder content.
WRITER_MAX_ATTEMPTS = 2


def split_sections(text: str) -> dict[str, str]:
    """Parse text with ``<!-- SECTION:name -->`` markers.

    Each marker introduces a section whose content runs until the next marker
    (or end of string). Returns a dict mapping section name (lowercased) to
    its trimmed content. Sections with empty content are omitted.
    """
    matches = list(_SECTION_MARKER_RE.finditer(text))
    sections: dict[str, str] = {}
    for i, m in enumerate(matches):
        name = m.group(1).lower()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if content:
            sections[name] = content
    return sections


def build_text(sections: dict[str, str], include: list[str]) -> str:
    """Assemble selected sections in the given order, joined by blank lines.

    Sections absent from ``sections`` (or empty) are silently skipped.
    """
    parts = [sections[name] for name in include if sections.get(name)]
    return "\n\n".join(parts)


def _load_skill_md() -> str:
    """Load the editorial spec from SKILL.md (must be in repo root or one level up)."""
    here = Path(__file__).resolve().parent
    for cand in (here.parent / "SKILL.md", here.parent.parent / "SKILL.md"):
        if cand.exists():
            return cand.read_text(encoding="utf-8")
    raise FileNotFoundError("SKILL.md not found next to cloud-pipeline/")


def _format_pubmed(data: dict[str, list[dict]]) -> str:
    """Compact PubMed results for the LLM prompt."""
    blocks = []
    for domain, articles in data.items():
        if not articles:
            blocks.append(f"## {domain}\n(aucun résultat récent)\n")
            continue
        lines = [f"## {domain}"]
        for a in articles:
            authors = ", ".join(a["authors"][:2]) or "n/a"
            lines.append(
                f"- PMID {a['pmid']} | {a['journal']} | {a['date']} | DOI {a['doi']}\n"
                f"  Auteurs : {authors}\n"
                f"  Titre : {a['title']}\n"
                f"  Résumé : {(a['abstract'] or '(pas de résumé)')[:600]}"
            )
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _extract_sources_from_grounding(response) -> str:
    """Extract web sources from Gemini grounding metadata."""
    lines = []
    try:
        for chunk in (response.candidates[0].grounding_metadata.grounding_chunks or []):
            if chunk.web:
                title = chunk.web.title or chunk.web.uri
                lines.append(f"- [{title}]({chunk.web.uri})")
    except (AttributeError, IndexError, TypeError):
        pass
    return "\n".join(lines) or "(pas de sources de grounding disponibles)"


def _placeholder_for(name: str, date_fr: str) -> str:
    """Fallback text used when Gemini omits a section even after retry."""
    if name == "intro":
        return f"Bonjour. Voici ta revue du jour, en date du {date_fr}."
    if name == "outro":
        return "Voilà pour cette revue. Bonne journée."
    # actu, big5, hypoxie, sport, ia — same neutral placeholder, conforme au SKILL.md.
    return "Rien de marquant aujourd'hui dans ce domaine."


SYSTEM_PROMPT_TMPL = """Tu es un journaliste-rédacteur produisant une revue quotidienne audio en français pour un auditeur unique.

Tu dois suivre **strictement** le SKILL.md ci-dessous, qui contient les règles éditoriales (structure, ton, durée cible, préférences). En particulier :
- Pas de prénom dans l'audio.
- Pas de mention orale des sources (le mot "Source : ..." est interdit dans le texte).
- Durée cible 9 à 10,5 minutes audio. MINIMUM ABSOLU : 11 000 caractères (toute sortie en dessous est insuffisante). Cible : 12 500 caractères. Plafond : 15 000 caractères.
- Vitesse de lecture lente (rendu TTS à PROSODY_RATE=0%).
- Sept sections balisées dans l'ordre : intro, actu, big5, hypoxie, sport, ia, outro.
- 1 à 2 articles maximum par section scientifique, uniquement si vraiment originaux.
- Chaque item d'actualité : 2 à 4 phrases complètes. Chaque item scientifique : 2 à 3 phrases complètes.
- Entre les sous-sections ou sujets, insère une transition orale courte ("Toujours à l'international,", "Par ailleurs,", "Passons à la Suisse,", etc.) pour aérer la lecture.
- Chiffres en lettres ("vingt-six" pas "26"), pas d'URL, pas d'emoji, pas de markdown.
- Phrases pleines, pas de listes à puces.
- INTERDIT : numéros de référence [1], [2], [3] ou toute autre annotation de citation dans le texte audio.

DATES (RÈGLE STRICTE) :
- La date d'aujourd'hui est : **{date_fr}**.
- N'invente JAMAIS de date ni de jour de la semaine. Quand tu mentionnes la date du jour, utilise EXACTEMENT la formulation ci-dessus, ou des références relatives (« aujourd'hui », « hier », « avant-hier », « cette semaine »).
- Ne dis JAMAIS « vendredi » si {weekday_fr} n'est pas vendredi, et ainsi de suite pour tous les jours de la semaine. En cas de doute, omets le jour de la semaine et garde uniquement le quantième et le mois.
- L'intro doit utiliser la date du jour ci-dessus, telle quelle.

TON ÉDITORIAL OBLIGATOIRE :
- **Factuel et sobre.** Pas de titres à sensation, pas de superlatifs (« choc », « inédit », « explosif »), pas de cliffhanger. Tu rapportes ce qui s'est passé, pas ce que tu en penses.
- **Équilibré et orienté positif.** Quand un sujet admet plusieurs angles, privilégie l'angle constructif (avancée, accord, solution, progrès) sans pour autant minimiser, censurer ou taire les sujets graves (conflits, catastrophes, scandales). Une guerre reste une guerre. L'objectif est d'éviter l'anxiogène gratuit, pas de cacher la réalité.
- **Aucun jugement de valeur** sur les acteurs cités (politiques, entreprises, chercheurs).

SOURCES À PRIVILÉGIER VIA GOOGLE SEARCH :
- Monde : Le Monde, Reuters, AFP, BBC.
- Suisse : RTS, Le Temps, Swissinfo, NZZ (en anglais ou allemand traduits en français).
- Vaud et Lausanne : 24 heures, Tribune de Genève (TX Group couvre les deux), RTS info régionale.
Tu peux compléter avec d'autres sources francophones reconnues si nécessaire, mais ces titres sont la base. Évite les agrégateurs, les blogs, et les médias à forte coloration éditoriale.

=== SKILL.md ===
{skill_md}
=== fin SKILL.md ===

Tu disposes de Google Search pour les actualités. Tu disposes des résultats PubMed déjà récupérés (transmis dans le message utilisateur) pour les sections scientifiques. Tu choisis 1-2 articles maximum par section parmi les résultats PubMed.

==========================================================
FORMAT DE SORTIE OBLIGATOIRE
==========================================================

Tu encapsules ta réponse dans un bloc REVUE :

<REVUE>
<!-- SECTION:intro -->
Bonjour. Voici ta revue du jour, en date du {date_fr}.
<!-- SECTION:actu -->
Commençons par les actualités générales. D'abord, à l'international, <...>. Du côté de la Suisse, <...>. Au niveau du canton de Vaud, <...>. Enfin, à Lausanne, <...>.
<!-- SECTION:big5 -->
Passons à la science générale, avec les grandes revues internationales. <...>
<!-- SECTION:hypoxie -->
Du côté de l'hypoxie clinique et appliquée, <...>
<!-- SECTION:sport -->
Côté sciences du sport, <...>
<!-- SECTION:ia -->
Enfin, sur l'intelligence artificielle appliquée à la santé, <...>
<!-- SECTION:outro -->
Voilà pour cette revue. Bonne journée.
</REVUE>

RÈGLES SUR LES MARQUEURS DE SECTION :
- Les sept marqueurs sont dans cet ordre exact, chacun sur sa propre ligne, avec du texte audio après chacun.
- N'utilise PAS de numérotation explicite ("Section un", "Section deux").
- Les transitions doivent être thématiques ("Passons à…", "Du côté de…", "Côté sciences du sport,").
- Ne pas inclure de marqueur de fin (pas de <!-- /SECTION:... -->).
- Si une section spécialisée (hypoxie, sport, ia) ne mérite rien aujourd'hui, écris "Rien de marquant aujourd'hui dans ce domaine." (mais garde le marqueur).
- Aucun caractère < ou > dans le texte audio hors des marqueurs de section.
- AUCUN numéro de référence [1] [2] dans le texte audio.
"""

USER_PROMPT_TMPL = """Date d'aujourd'hui : {date_fr} (ISO : {today_iso}).

=== Résultats PubMed récents ===
{pubmed_block}
=== fin résultats PubMed ===

Tâche :
1. Recherche les actualités majeures des dernières 24h (Monde, Suisse, Vaud, Lausanne) via Google Search.
2. Sélectionne au plus 1-2 articles parmi les résultats Big 5 (les plus intéressants, écarte les replies/letters/errata).
3. Sélectionne 1 à 2 articles par section spécialisée (Hypoxie, Sport, IA santé) parmi les résultats fournis. Si aucun n'est vraiment original pour une section, indique-le explicitement à l'intérieur du marqueur correspondant.
4. Rédige la revue complète en respectant le format de sortie obligatoire (bloc REVUE avec sept sections balisées).

MINIMUM ABSOLU : 11 000 caractères pour la somme du texte audio (toutes sections confondues, marqueurs exclus). Cible : 12 500 caractères. Plafond : 15 000 caractères.

Répartition OBLIGATOIRE par section :
- actu (Monde + Suisse + Vaud + Lausanne) : MINIMUM 5 500 caractères. Tu dois couvrir AU MINIMUM : 4 sujets internationaux + 3 sujets suisses + 2 sujets vaudois + 2 sujets lausannois = 11 sujets. Chaque sujet : 4 phrases de 120 à 150 caractères chacune. Transitions obligatoires entre sujets.
- big5 : MINIMUM 1 500 caractères (2 articles, 4 phrases de 120+ chars chacune)
- hypoxie : MINIMUM 700 caractères (1-2 articles, 3 phrases chacun)
- sport : MINIMUM 700 caractères (1-2 articles, 3 phrases chacun)
- ia : MINIMUM 700 caractères (1-2 articles, 3 phrases chacun)
- intro + outro : ~300 caractères

VALIDATION AVANT DE RENDRE LA RÉPONSE :
Compte tes sujets dans la section actu : s'il y en a moins de 11, ajoute-en (utilise Google Search). Si tu estimes que le total dépasse 11 000 caractères, tu peux rendre ta réponse. Si tu doutes, ajoute encore un sujet Monde ou Suisse.
"""

_RETRY_REMINDER = """

IMPORTANT — tentative précédente invalide. Ta sortie précédente n'a pas
respecté le format obligatoire (bloc <REVUE> absent ou marqueurs de section
manquants). Tu DOIS impérativement :
- Encapsuler toute la revue dans un unique bloc <REVUE>...</REVUE>.
- Émettre les SEPT marqueurs <!-- SECTION:name --> dans l'ordre exact :
  intro, actu, big5, hypoxie, sport, ia, outro.
- Chaque marqueur sur sa propre ligne, suivi du texte audio.
- Aucune section ne doit être omise. Si une section scientifique ne mérite
  rien aujourd'hui, écris simplement "Rien de marquant aujourd'hui dans ce
  domaine." mais GARDE le marqueur.
"""


def _gemini_generate(client, system: str, user: str, *, with_search: bool, max_tokens: int = 16000):
    """Call Gemini with retry on rate-limit / server overload (up to 5 attempts)."""
    tools = [types.Tool(google_search=types.GoogleSearch())] if with_search else []
    config = types.GenerateContentConfig(
        system_instruction=system,
        tools=tools,
        max_output_tokens=max_tokens,
        temperature=1.0,
    )
    _delay = 30
    for _attempt in range(5):
        try:
            return client.models.generate_content(
                model=MODEL,
                contents=user,
                config=config,
            )
        except Exception as exc:
            msg = str(exc).lower()
            retriable = any(k in msg for k in ("429", "quota", "overload", "503", "resource exhausted", "rate limit"))
            if retriable and _attempt < 4:
                wait = _delay * (2 ** _attempt)
                print(f"[writer] Gemini rate-limit/overload (attempt {_attempt+1}/5), retry in {wait}s")
                time.sleep(wait)
            else:
                raise


def _extract_revue_block(text: str) -> str:
    """Extract the inside of <REVUE>...</REVUE>; returns '' if not found."""
    start = text.find("<REVUE>")
    end = text.find("</REVUE>", start)
    if start < 0 or end < 0:
        return ""
    return text[start + 7:end].strip()


def write_revue(
    today: date | datetime | str,
    pubmed_data: dict,
    *,
    previous_revue: str = "",
    api_key: str | None = None,
) -> tuple[str, str]:
    """Return ``(revue_text_with_markers, sources_md)``.

    The first element preserves the ``<!-- SECTION:name -->`` markers — call
    :func:`split_sections` to obtain a per-section dict, then
    :func:`build_text` to assemble a marker-free script ready for TTS.

    ``today`` may be a :class:`datetime`, :class:`date`, or an ISO string
    ``YYYY-MM-DD``. The canonical French weekday/date is computed in Python
    and injected into the prompt — the model is forbidden from inventing
    dates.

    ``previous_revue`` is the plain text of yesterday's revue (no markers).
    When provided, it is injected into the system prompt so the model avoids
    repeating topics already covered the day before.

    Resilience: Gemini occasionally returns an empty/malformed response or
    drops section markers. We retry up to :data:`WRITER_MAX_ATTEMPTS` times
    with a stronger reminder. If sections are still missing after retries,
    we fill the gaps with the canonical "Rien de marquant aujourd'hui dans
    ce domaine." placeholder so the pipeline can still publish (degraded
    mode) rather than crash the whole run.
    """
    if isinstance(today, str):
        today_d = date.fromisoformat(today)
    elif isinstance(today, datetime):
        today_d = today.date()
    else:
        today_d = today

    today_iso = today_d.isoformat()
    date_fr = format_french_date(today_d)
    weekday_fr = french_weekday(today_d)

    client = genai.Client(api_key=api_key or os.environ["GOOGLE_API_KEY"])
    skill = _load_skill_md()

    # Build dedup block from yesterday's revue (truncated to keep prompt size reasonable).
    dedup_block = ""
    if previous_revue.strip():
        excerpt = previous_revue.strip()[:4000]
        dedup_block = (
            "\n\nSUJETS DÉJÀ TRAITÉS HIER — NE PAS RÉPÉTER :\n"
            "Les sujets suivants ont été couverts dans la revue d'hier. "
            "Ne les traite pas à nouveau aujourd'hui, même sous un angle différent. "
            "Si un sujet a évolué de manière significative (nouveau développement, "
            "changement majeur), tu peux le mentionner brièvement en précisant "
            "l'évolution, mais sans répéter le contexte déjà connu.\n\n"
            f"{excerpt}\n"
            "=== fin sujets d'hier ==="
        )

    system_prompt = SYSTEM_PROMPT_TMPL.format(
        skill_md=skill, date_fr=date_fr, weekday_fr=weekday_fr
    ) + dedup_block
    user_prompt = USER_PROMPT_TMPL.format(
        date_fr=date_fr, today_iso=today_iso, pubmed_block=_format_pubmed(pubmed_data)
    )

    # ---- Attempt loop: try up to WRITER_MAX_ATTEMPTS to get a complete revue.
    revue = ""
    sources = ""
    missing: list[str] = list(SECTIONS_FULL)
    for attempt in range(1, WRITER_MAX_ATTEMPTS + 1):
        sys_prompt_for_attempt = system_prompt + (_RETRY_REMINDER if attempt > 1 else "")
        response = _gemini_generate(client, sys_prompt_for_attempt, user_prompt, with_search=True)
        full = response.text or ""
        sources = _extract_sources_from_grounding(response) or sources
        candidate = _extract_revue_block(full)
        if not candidate:
            print(
                f"[writer] Attempt {attempt}/{WRITER_MAX_ATTEMPTS}: aucun bloc "
                f"<REVUE> dans la sortie (sortie: {full[:300]!r})"
            )
            continue
        found_names = [m.group(1).lower() for m in _SECTION_MARKER_RE.finditer(candidate)]
        candidate_missing = [s for s in SECTIONS_FULL if s not in found_names]
        # Keep the best attempt so far (fewest missing sections).
        if not revue or len(candidate_missing) < len(missing):
            revue = candidate
            missing = candidate_missing
        if not candidate_missing:
            break
        print(
            f"[writer] Attempt {attempt}/{WRITER_MAX_ATTEMPTS}: sections "
            f"manquantes {candidate_missing}, retry avec rappel renforcé"
        )

    # ---- Fallback : combler les sections manquantes plutôt que crasher.
    if not revue:
        print(
            "[writer] AUCUN bloc <REVUE> valide après "
            f"{WRITER_MAX_ATTEMPTS} tentatives — génération d'une revue "
            "placeholder pour ne pas bloquer la publication."
        )
        sections = {name: _placeholder_for(name, date_fr) for name in SECTIONS_FULL}
        missing = list(SECTIONS_FULL)
    else:
        sections = split_sections(revue)
        if missing:
            print(
                f"[writer] Sections finalement manquantes : {missing}. "
                "Comblement avec placeholder ('Rien de marquant...') pour "
                "ne pas bloquer la publication."
            )
            for name in missing:
                sections[name] = _placeholder_for(name, date_fr)

    # Rebuild revue with markers in canonical order, ne gardant que les sections non vides.
    revue = "\n\n".join(
        f"<!-- SECTION:{name} -->\n{sections[name]}"
        for name in SECTIONS_FULL
        if sections.get(name)
    )

    # Extension automatique si le total est trop court.
    # Seuil : 11 500 chars (~8 min 55s). Objectif après extension : 12 500.
    EXTENSION_THRESHOLD = 11_500
    EXTENSION_TARGET = 12_500
    sections = split_sections(revue)
    total_chars = sum(len(v) for v in sections.values())
    print(f"[writer] Total chars avant extension : {total_chars}")

    if total_chars < EXTENSION_THRESHOLD:
        actu_now = sections.get("actu", "")
        actu_len = len(actu_now)
        target_actu = actu_len + (EXTENSION_TARGET - total_chars) + 500
        print(
            f"[writer] Revue trop courte ({total_chars} < {EXTENSION_THRESHOLD}). "
            f"Extension actu : {actu_len} → {target_actu} chars cible."
        )
        try:
            ext_system = (
                f"Tu es un journaliste. La section actualité d'une revue audio est trop courte. "
                f"Date du jour : {date_fr}. "
                f"Tu vas l'étendre en ajoutant des sujets d'actualité récents non encore couverts. "
                f"Format TTS uniquement : phrases pleines, pas de listes, pas d'URL, chiffres en lettres. "
                f"Aucun numéro de référence [1][2] dans le texte. "
                f"Transitions entre sujets obligatoires ('Par ailleurs,', 'Toujours à l'international,', "
                f"'Du côté de la Suisse,', etc.). Chaque sujet ajouté : 4 phrases de 120+ caractères chacune."
            )
            ext_user = (
                f"Section actu actuelle ({actu_len} chars) :\n\n{actu_now}\n\n"
                f"Ajoute des sujets d'actualité récents (Monde, Suisse, Vaud ou Lausanne) "
                f"non encore couverts ci-dessus, jusqu'à atteindre {target_actu} caractères au total. "
                f"Retourne la section actu COMPLETE (texte original + ajouts), sans marqueurs, "
                f"prête pour TTS."
            )
            ext_response = _gemini_generate(
                client, ext_system, ext_user, with_search=True, max_tokens=6000
            )
            actu_ext = (ext_response.text or "").strip()
            if len(actu_ext) > actu_len:
                sections["actu"] = actu_ext
                # Rebuild revue with markers in canonical order
                revue = "\n\n".join(
                    f"<!-- SECTION:{name} -->\n{sections[name]}"
                    for name in SECTIONS_FULL
                    if sections.get(name)
                )
                new_total = sum(len(v) for v in sections.values())
                print(f"[writer] Extension OK : {total_chars} → {new_total} chars")
            else:
                print(
                    f"[writer] Extension ignorée : résultat pas plus long "
                    f"({len(actu_ext)} <= {actu_len} chars)"
                )
        except Exception as ext_exc:
            print(f"[writer] Extension échouée ({ext_exc}), revue originale conservée")

    return revue, sources
