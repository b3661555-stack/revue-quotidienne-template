"""Deterministic French dates and a post-generation date validator.

The model used to be asked to derive the weekday from an ISO date string in
its head; this turned into hallucinations such as "vendredi 2 mai" for a
Saturday. We now compute the canonical French weekday/month in Python and
inject them into the prompt, then validate the generated script against
that canonical date.
"""
from __future__ import annotations

import re
from datetime import date, datetime

WEEKDAYS_FR = (
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
)

MONTHS_FR = (
    "",  # 1-indexed
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)

# Lowercase set for fast membership checks during validation.
_WEEKDAY_SET = set(WEEKDAYS_FR)
_MONTH_SET = {m for m in MONTHS_FR if m}


def french_weekday(d: date) -> str:
    """Return the French weekday name (lowercase) for ``d``. Monday=0."""
    return WEEKDAYS_FR[d.weekday()]


def french_month(d: date) -> str:
    """Return the French month name (lowercase) for ``d``."""
    return MONTHS_FR[d.month]


def format_french_date(d: date | datetime) -> str:
    """Return e.g. ``"dimanche 3 mai 2026"`` for ``d``."""
    if isinstance(d, datetime):
        d = d.date()
    return f"{french_weekday(d)} {d.day} {french_month(d)} {d.year}"


# Match "<weekday> <day> <month>", allowing optional comma between weekday and
# day, and optionally a trailing year. Day is 1-31. Case-insensitive on the
# weekday/month (the model sometimes capitalises after a period).
_DATE_PHRASE_RE = re.compile(
    r"\b(?P<weekday>lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+"
    r"(?:le\s+)?"
    r"(?P<day>\d{1,2})(?:\s*(?:er))?\s+"
    r"(?P<month>janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)"
    r"(?:\s+(?P<year>\d{4}))?",
    re.IGNORECASE,
)


class DateMismatchError(ValueError):
    """Raised when the generated script claims a weekday that does not match the date."""


def validate_dates(text: str, today: date | datetime, *, allowed_years: tuple[int, ...] | None = None) -> None:
    """Scan ``text`` for ``<weekday> <day> <month> [year]`` phrases.

    For each match, compute the actual weekday for that calendar date and
    raise :class:`DateMismatchError` on the first mismatch.

    The year is taken from the phrase if present, otherwise from ``today``
    (with a ±1 year fallback only if today's year produces an invalid
    calendar date — e.g. ``29 février`` mentioned around 1 March of a
    non-leap year following a leap year).
    """
    if isinstance(today, datetime):
        today = today.date()
    candidate_years = allowed_years or (today.year,)

    for m in _DATE_PHRASE_RE.finditer(text):
        weekday_claimed = m.group("weekday").lower()
        day = int(m.group("day"))
        month_name = m.group("month").lower()
        month_idx = MONTHS_FR.index(month_name)
        year_in_phrase = m.group("year")
        years_to_try = (int(year_in_phrase),) if year_in_phrase else candidate_years

        actual_weekday = None
        for y in years_to_try:
            try:
                actual_weekday = french_weekday(date(y, month_idx, day))
                if actual_weekday == weekday_claimed:
                    break
            except ValueError:
                continue

        if actual_weekday is None:
            raise DateMismatchError(
                f"Date impossible dans le script : « {m.group(0)} » "
                f"({day} {month_name} n'existe pas pour les années testées {years_to_try})."
            )
        if actual_weekday != weekday_claimed:
            raise DateMismatchError(
                f"Jour de la semaine incorrect dans le script : « {m.group(0)} » — "
                f"le {day} {month_name} {years_to_try[0]} est un {actual_weekday}, "
                f"pas un {weekday_claimed}."
            )
