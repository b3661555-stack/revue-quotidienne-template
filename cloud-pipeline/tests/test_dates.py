"""Tests for the post-generation date validator."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

# Make src/ importable when running pytest from cloud-pipeline/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.dates import (  # noqa: E402
    DateMismatchError,
    format_french_date,
    french_weekday,
    validate_dates,
)


def test_format_french_date_sunday():
    assert format_french_date(date(2026, 5, 3)) == "dimanche 3 mai 2026"


def test_format_french_date_leap_day():
    assert format_french_date(date(2024, 2, 29)) == "jeudi 29 février 2024"


def test_french_weekday_known_dates():
    # 2026-05-02 was a Saturday (the bug the user reported); 2026-05-03 a Sunday.
    assert french_weekday(date(2026, 5, 2)) == "samedi"
    assert french_weekday(date(2026, 5, 3)) == "dimanche"


def test_validate_dates_passes_on_correct_script():
    # 2026-05-03 is a Sunday; 2026-05-02 was a Saturday.
    text = (
        "Bonjour. Voici ta revue du jour, en date du dimanche 3 mai 2026.\n"
        "Hier samedi 2 mai, plusieurs choses se sont passées..."
    )
    validate_dates(text, date(2026, 5, 3))  # must not raise


def test_validate_dates_passes_with_no_date_mention():
    validate_dates("Bonjour. Aujourd'hui, voici la revue.", date(2026, 5, 3))


def test_validate_dates_catches_user_reported_bug():
    """The exact bug: 'vendredi 2 mai' said on Sunday 2026-05-03 (the 2nd was a Saturday)."""
    text = "Voici la revue du jour, en date du vendredi 2 mai 2026."
    with pytest.raises(DateMismatchError, match="samedi"):
        validate_dates(text, date(2026, 5, 3))


def test_validate_dates_catches_wrong_weekday_year_inferred():
    # Same bug, but no explicit year in the script: the year falls back to today.year.
    text = "Hier vendredi 2 mai, ..."
    with pytest.raises(DateMismatchError):
        validate_dates(text, date(2026, 5, 3))


def test_validate_dates_catches_impossible_calendar_date():
    text = "Le mardi 30 février, ..."
    with pytest.raises(DateMismatchError, match="impossible"):
        validate_dates(text, date(2026, 5, 3))


def test_validate_dates_case_insensitive():
    # Capitalised after a period should still trigger the validator.
    text = "Une nouvelle. Vendredi 2 mai, le contrat fut signé."
    with pytest.raises(DateMismatchError):
        validate_dates(text, date(2026, 5, 3))
