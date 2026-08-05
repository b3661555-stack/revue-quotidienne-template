"""PubMed search via NCBI E-utilities REST API.

NCBI rate-limits unauthenticated callers to 3 req/s per IP (10 req/s with an
API key). GitHub-hosted runners share IPs, so 429s are routine without a key
and a single failed request would otherwise abort the whole pipeline. To keep
runs robust we (a) attach NCBI_API_KEY/tool/email when present, (b) retry on
429/5xx with exponential backoff via urllib3, and (c) throttle outgoing calls
to stay under the per-IP cap.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Iterable
from xml.etree import ElementTree as ET

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

EUTILS_HOST = "https://eutils.ncbi.nlm.nih.gov"
ESEARCH = f"{EUTILS_HOST}/entrez/eutils/esearch.fcgi"
ESUMMARY = f"{EUTILS_HOST}/entrez/eutils/esummary.fcgi"
EFETCH = f"{EUTILS_HOST}/entrez/eutils/efetch.fcgi"


def _build_session() -> requests.Session:
    retry = Retry(
        total=5,
        backoff_factor=1.0,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET", "POST"]),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s = requests.Session()
    s.mount(EUTILS_HOST, adapter)
    return s


_SESSION = _build_session()
_throttle_lock = threading.Lock()
_last_request_ts = 0.0


def _auth_params() -> dict[str, str]:
    out: dict[str, str] = {}
    for env_key, param_key in (("NCBI_API_KEY", "api_key"), ("NCBI_TOOL", "tool"), ("NCBI_EMAIL", "email")):
        val = os.environ.get(env_key)
        if val:
            out[param_key] = val
    return out


def _throttle() -> None:
    # 10 req/s with an API key, 3 req/s otherwise (NCBI policy).
    min_interval = 0.11 if os.environ.get("NCBI_API_KEY") else 0.34
    global _last_request_ts
    with _throttle_lock:
        wait = min_interval - (time.monotonic() - _last_request_ts)
        if wait > 0:
            time.sleep(wait)
        _last_request_ts = time.monotonic()


def _eutils_get(url: str, params: dict, *, timeout: int) -> requests.Response:
    merged = {**params, **_auth_params()}
    _throttle()
    r = _SESSION.get(url, params=merged, timeout=timeout)
    if not r.ok:
        # NCBI puts the actual reason in the body; raise_for_status drops it.
        body = (r.text or "")[:500].replace("\n", " ")
        raise requests.HTTPError(f"{r.status_code} {r.reason} from {url} — body: {body}", response=r)
    return r


def search(term: str, *, days_back: int = 3, max_results: int = 25) -> list[str]:
    """Return PMIDs of articles matching `term` indexed in last `days_back` days."""
    params = {
        "db": "pubmed",
        "term": term,
        "datetype": "edat",
        "reldate": days_back,
        "retmax": max_results,
        "sort": "pub_date",
        "retmode": "json",
    }
    r = _eutils_get(ESEARCH, params, timeout=30)
    return r.json().get("esearchresult", {}).get("idlist", [])


def fetch_metadata(pmids: Iterable[str]) -> list[dict]:
    """Fetch title, abstract, journal, authors, date for given PMIDs."""
    pmids = list(pmids)
    if not pmids:
        return []
    params = {"db": "pubmed", "id": ",".join(pmids), "rettype": "abstract", "retmode": "xml"}
    r = _eutils_get(EFETCH, params, timeout=60)
    root = ET.fromstring(r.content)

    out = []
    for art in root.findall(".//PubmedArticle"):
        pmid = art.findtext(".//PMID") or ""
        title = (art.findtext(".//ArticleTitle") or "").strip()
        abstract = " ".join(t.text or "" for t in art.findall(".//AbstractText")).strip()
        journal = art.findtext(".//Journal/Title") or ""
        doi = ""
        for elt in art.findall(".//ArticleId"):
            if elt.attrib.get("IdType") == "doi":
                doi = (elt.text or "").strip()
                break
        authors = []
        for au in art.findall(".//Author")[:3]:
            ln = au.findtext("LastName") or ""
            fn = au.findtext("ForeName") or ""
            if ln:
                authors.append(f"{fn} {ln}".strip())
        year = art.findtext(".//PubDate/Year") or ""
        month = art.findtext(".//PubDate/Month") or ""
        day = art.findtext(".//PubDate/Day") or ""
        out.append({
            "pmid": pmid, "title": title, "abstract": abstract,
            "journal": journal, "doi": doi, "authors": authors,
            "date": f"{year}-{month}-{day}".strip("-"),
        })
    return out


# Pre-built queries aligned with SKILL.md editorial filters
QUERIES = {
    "big5": (
        '("Nature"[Journal] OR "Science (New York, N.Y.)"[Journal] OR "Cell"[Journal] '
        'OR "Lancet (London, England)"[Journal] OR "The New England journal of medicine"[Journal])'
    ),
    "hypoxia": (
        '(altitude OR "high altitude" OR "hypoxic training" OR "intermittent hypoxia" '
        'OR "obstructive sleep apnea" OR "exercise hypoxia" OR "oxygen therapy") '
        'AND (athlete OR exercise OR clinical OR patient OR randomized)'
    ),
    "sport": (
        '("VO2max" OR "running economy" OR "concurrent training" OR "sprint performance" '
        'OR "endurance training" OR "athletic performance" OR "sports medicine") '
        'AND ("Randomized Controlled Trial"[Publication Type] OR "Clinical Trial"[Publication Type])'
    ),
    "ai_health": (
        '("artificial intelligence" OR "machine learning" OR "deep learning" OR "foundation model") '
        'AND ("clinical" OR "healthcare" OR "patient outcome" OR "mortality")'
    ),
}


def gather_all(days_back: int = 3) -> dict[str, list[dict]]:
    """Run all queries and return raw results grouped by domain."""
    out = {}
    for key, q in QUERIES.items():
        pmids = search(q, days_back=days_back, max_results=15)
        out[key] = fetch_metadata(pmids[:10])
    return out


if __name__ == "__main__":
    data = gather_all(days_back=3)
    for k, v in data.items():
        print(f"=== {k}: {len(v)} articles ===")
        for art in v[:3]:
            print(f"  - {art['journal']}: {art['title'][:80]}")
