"""Location-preserving chunking and fallback keyword retrieval for browser drafts."""

import math
import re
from collections import Counter
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

STOP_WORDS = set(
    "a an and are as at be by can could did do does for from had has have how i in is it me of on "
    "or our please that the their these this to was were what when where which who why with you "
    "your about sources documents according study research researcher paper author".split()
)

WORD_FORMS = {
    "methodologies": "methodology", "methodological": "methodology",
    "approaches": "approach", "strategies": "strategy", "procedures": "procedure",
    "techniques": "technique", "designs": "design", "used": "use", "using": "use",
    "conducted": "conduct", "conducting": "conduct", "employed": "employ",
    "employing": "employ", "carried": "carry", "carrying": "carry",
    "collected": "collect", "collecting": "collect", "gathered": "gather",
    "gathering": "gather", "find": "finding", "found": "finding", "findings": "finding",
    "results": "result",
    "outcomes": "outcome", "limitations": "limitation", "weaknesses": "weakness",
    "challenges": "challenge", "participants": "participant", "respondents": "respondent",
    "subjects": "subject", "studies": "study", "researchers": "researcher",
    "interviews": "interview", "surveys": "survey", "questionnaires": "questionnaire",
    "observations": "observation", "experiments": "experiment", "analyses": "analysis",
    "analyzed": "analyze", "analysed": "analyse", "examined": "examine",
    "explored": "explore", "investigated": "investigate", "identified": "identify",
    "revealed": "reveal", "discovered": "discover", "showed": "show",
    "demonstrated": "demonstrate",
    "improved": "improve", "increased": "increase", "decreased": "decrease",
    "participated": "participate", "participating": "participate", "involved": "involve",
    "recruited": "recruit", "selected": "select", "sought": "seek", "intended": "intend",
    "aimed": "aim",
}

# Query expansion stays deliberately small and domain-focused. The exact query
# terms keep full weight; related academic terms only help find candidate pages.
CONCEPTS = {
    "methods": {
        "cues": {
            "method", "methodology", "approach", "strategy", "procedure", "technique", "design",
            "conduct", "collect", "gather", "employ", "perform",
        },
        "terms": {
            "method", "methodology", "approach", "strategy", "procedure", "technique", "design",
            "conduct", "employ", "interview", "survey", "questionnaire", "experiment",
            "observation", "focus", "group", "qualitative", "quantitative", "sampling",
            "collect", "gather",
        },
    },
    "findings": {
        "cues": {"finding", "result", "outcome", "discover", "reveal", "impact", "effect"},
        "terms": {
            "finding", "result", "outcome", "discover", "reveal", "show", "demonstrate",
            "indicate", "improve", "increase", "decrease", "impact", "effect",
        },
    },
    "aims": {
        "cues": {"aim", "objective", "purpose", "goal", "examine", "explore", "investigate"},
        "terms": {
            "aim", "objective", "purpose", "goal", "intend", "seek", "examine", "explore",
            "investigate", "determine",
        },
    },
    "limitations": {
        "cues": {"limitation", "weakness", "constraint", "challenge", "drawback"},
        "terms": {
            "limitation", "weakness", "constraint", "challenge", "drawback", "restrict", "unable",
        },
    },
    "evidence": {
        "cues": {"evidence", "support", "useful", "relevance", "relevant"},
        "terms": {
            "finding", "result", "outcome", "conclusion", "evidence", "support",
            "show", "demonstrate", "indicate", "impact", "effect",
        },
    },
    "participants": {
        "cues": {
            "participant", "respondent", "subject", "sample", "population", "participate", "involve", "recruit",
        },
        "terms": {
            "participant", "respondent", "subject", "sample", "population", "participate", "involve", "recruit",
            "select", "student", "teacher", "patient",
        },
    },
}

EXPANSION_WEIGHT = 0.35
CONTEXT_ONLY_TERMS = {
    "explain", "elaborate", "expand", "further", "more", "detail", "details",
    "use", "mean", "useful", "help",
}


class Page(BaseModel):
    page_number: int = Field(ge=1)
    text: str = Field(max_length=2_000_000)
    locator_type: Literal["page", "paragraph", "line"]


class Source(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    project_id: str = Field(min_length=1, max_length=100)
    filename: str = Field(min_length=1, max_length=180)
    pages: list[Page] = Field(max_length=10000)


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2500)


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=3, max_length=2000)
    sources: list[Source] = Field(max_length=50)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def project_and_size(self):
        if any(source.project_id != self.project_id for source in self.sources):
            raise ValueError("Every source must belong to the selected project.")
        if len({source.id for source in self.sources}) != len(self.sources):
            raise ValueError("Duplicate source IDs.")
        if sum(len(page.text) for source in self.sources for page in source.pages) > 2_000_000:
            raise ValueError("Select a smaller source library (maximum 2 million characters per question).")
        if sum(len(turn.content) for turn in self.history) > 12_000:
            raise ValueError("Recent chat context is too large. Start a new conversation and retry.")
        if not self.question.strip():
            raise ValueError("Enter a question.")
        return self

    @property
    def retrieval_query(self) -> str:
        current_terms = set(terms(self.question))
        needs_context = not current_terms or (
            len(current_terms) <= 2 and current_terms <= CONTEXT_ONLY_TERMS
        )
        previous_questions = [turn.content for turn in self.history if turn.role == "user"]
        if needs_context and previous_questions:
            return f"{previous_questions[-1]}\nFollow-up: {self.question}"
        return self.question


def normalize_word(word: str) -> str:
    word = WORD_FORMS.get(word, word)
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("s") and len(word) > 3 and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def terms(text: str) -> list[str]:
    normalized = (normalize_word(word) for word in re.findall(r"\w+", text.casefold()))
    return [word for word in normalized if len(word) > 1 and word not in STOP_WORDS]


def query_weights(question: str) -> dict[str, float]:
    query_terms = set(terms(question))
    weights = {word: 1.0 for word in query_terms}
    question_text = question.casefold()
    for name, concept in CONCEPTS.items():
        matched = bool(query_terms & concept["cues"])
        if name == "methods" and not matched:
            matched = bool(re.search(
                r"\bhow\b.*\b(?:do|does|did|was|were|conduct|carry|collect|gather|perform)\b"
                r".*\b(?:study|research|data)\b",
                question_text,
            ))
        if name == "participants" and not matched:
            matched = bool(re.search(r"\bwho\b.*\b(?:took part|take part|participate)\b", question_text))
        if matched:
            for word in concept["terms"]:
                normalized = normalize_word(word)
                if normalized not in STOP_WORDS:
                    weights.setdefault(normalized, EXPANSION_WEIGHT)
    return weights


def chunks(text: str, limit: int = 600, overlap: int = 80) -> list[str]:
    """Chunk within one location using whitespace words; never merge page numbers."""
    words = list(re.finditer(r"\S+", text))
    result = []
    for start in range(0, len(words), limit - overlap):
        end = min(start + limit, len(words))
        result.append(text[words[start].start():words[end - 1].end()])
        if end == len(words):
            break
    return result


def candidate_chunks(request: Question) -> list[dict]:
    """Build page-local chunks with stable provenance before retrieval."""
    candidates = []
    for source in request.sources:
        for page in source.pages:
            for text in chunks(page.text):
                candidates.append({
                    "source_id": source.id,
                    "filename": source.filename,
                    "location": page.page_number,
                    "locator_type": page.locator_type,
                    "text": text,
                    "page_text": page.text,
                })
    return candidates


def retrieve(request: Question, top_k: int = 5) -> list[dict]:
    candidates = candidate_chunks(request)
    for item in candidates:
        item["counts"] = Counter(terms(item["text"]))
    query = query_weights(request.retrieval_query)
    if not query or not candidates:
        return []
    frequencies = {word: sum(word in item["counts"] for item in candidates) for word in query}
    ranked = []
    for index, item in enumerate(candidates):
        counts = item.pop("counts")
        length = max(1, sum(counts.values()))
        score = sum(
            weight * math.log(1 + len(candidates) / (1 + frequencies[word]))
            * counts[word] / (counts[word] + 1.2 * (0.25 + 0.75 * length / 250))
            for word, weight in query.items()
            if counts[word]
        )
        if score > 0:
            ranked.append((score, index, item))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [dict(item, id=f"E{index + 1}") for index, (_, _, item) in enumerate(ranked[:top_k])]


def quote_options(evidence: list[dict]) -> list[dict]:
    """Only whole extracted sentences can be selected, never model-written quotes."""
    options = []
    seen = set()
    for passage in evidence:
        for sentence in re.split(r"(?<=[.!?])\s+|\n\s*\n", passage["page_text"]):
            sentence = sentence.strip()
            key = (passage["source_id"], passage["location"], sentence)
            if (
                sentence
                and sentence in passage["text"]
                and len(sentence) <= 4000
                and key not in seen
            ):
                seen.add(key)
                option = {**passage, "id": f"Q{len(options) + 1}", "text": sentence}
                options.append({key: value for key, value in option.items() if key != "page_text"})
    return options[:80]
