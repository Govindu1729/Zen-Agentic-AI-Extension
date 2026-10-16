"""
NLP Processor / ML backend for the Zen Agentic Extension.

Speaks two wire protocols on stdin/stdout, one JSON object per line:

1. Native-host mode (used by native-host/src/ml_bridge.rs):
       request : {"action": "analyze_sentiment", "text": "..."}
       response: {"status": "success", "data": <payload>, "message": null}
   The Rust side deserialises into MlResponse { status, data, message }.

2. JSON-RPC-ish mode (documented in docs/setup-guide.md):
       request : {"id": "x", "method": "process_text", "params": {...}}
       response: {"id": "x", "result": {...}}  or  {"id": "x", "error": {...}}

Payload shapes are chosen to match the Rust types exactly:
  * sentiment      -> {"positive": f, "negative": f, "neutral": f}
  * entities       -> [ {...}, ... ]
  * summarize      -> {"summary": "..."}
  * keywords       -> ["word", ...]                 (Rust: Vec<String>)
  * embedding      -> [f32, ...]                    (Rust: Vec<f32>)
  * query_rag      -> {"results": [...], "query": "..."}
  * store_document -> {"stored_count": n}
"""

import hashlib
import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

EMBEDDING_DIM = 384

POSITIVE_WORDS = {
    "good", "great", "excellent", "amazing", "wonderful", "fantastic",
    "awesome", "positive", "happy", "love", "best", "perfect", "beautiful",
    "helpful", "success", "win", "improved", "fast", "reliable",
}
NEGATIVE_WORDS = {
    "bad", "terrible", "awful", "horrible", "worst", "negative", "sad",
    "hate", "poor", "fail", "error", "problem", "issue", "wrong", "broken",
    "slow", "crash", "bug", "useless", "confusing",
}
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "need",
    "it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
    "we", "they", "what", "which", "who", "whom", "whose", "where", "when",
    "why", "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
}


@dataclass
class NLPResult:
    """Container for NLP analysis results (JSON-RPC mode)."""

    text: str
    language: str = "en"
    sentiment: Optional[Dict[str, float]] = None
    entities: Optional[List[Dict[str, Any]]] = None
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None


class NLPProcessor:
    """Local, dependency-free NLP heuristics (Phase 1)."""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.initialized = False

    def initialize(self) -> bool:
        self.initialized = True
        return True

    # -- individual analyses ------------------------------------------------

    def analyze_sentiment(self, text: str) -> Dict[str, float]:
        words = re.findall(r"[a-z']+", text.lower())
        pos = sum(1 for w in words if w in POSITIVE_WORDS)
        neg = sum(1 for w in words if w in NEGATIVE_WORDS)
        total = pos + neg
        if total == 0:
            return {"positive": 0.5, "negative": 0.5, "neutral": 1.0}
        positive = pos / total
        negative = neg / total
        neutral = max(0.0, 1.0 - abs(positive - negative))
        return {
            "positive": round(max(0.0, min(1.0, positive)), 4),
            "negative": round(max(0.0, min(1.0, negative)), 4),
            "neutral": round(max(0.0, min(1.0, neutral)), 4),
        }

    def extract_entities(self, text: str) -> List[Dict[str, Any]]:
        entities: List[Dict[str, Any]] = []
        patterns = [
            ("EMAIL", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
            ("URL", r"https?://[^\s<>\"{}|\\^`\[\]]+"),
            ("MONEY", r"\$\s?\d[\d,]*(?:\.\d{2})?"),
            ("DATE", r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
            ("ISO_DATE", r"\b\d{4}-\d{2}-\d{2}\b"),
            ("PERCENT", r"\b\d+(?:\.\d+)?\s?%"),
        ]
        for label, pattern in patterns:
            for match in re.findall(pattern, text):
                entities.append({"text": match, "type": label})
        return entities

    def summarize(self, text: str, max_sentences: int = 3) -> str:
        if max_sentences < 1:
            max_sentences = 1
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if len(sentences) <= max_sentences:
            return text.strip()
        return " ".join(sentences[:max_sentences])

    def extract_keywords(self, text: str, top_k: int = 5) -> List[str]:
        freq: Dict[str, int] = {}
        for word in re.findall(r"[a-z0-9']+", text.lower()):
            if len(word) > 2 and word not in STOPWORDS:
                freq[word] = freq.get(word, 0) + 1
        ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
        return [w for w, _ in ranked[: max(0, top_k)]]

    def generate_embedding(self, text: str, dim: int = EMBEDDING_DIM) -> List[float]:
        """Deterministic hashed bag-of-words embedding (no external model)."""
        vec = [0.0] * dim
        for token in re.findall(r"[a-z0-9']+", text.lower()):
            digest = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            vec[digest % dim] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [round(v / norm, 6) for v in vec]

    def process(self, text: str, analysis_types: List[str], language: str = "en") -> NLPResult:
        result = NLPResult(text=text, language=language)
        if "sentiment" in analysis_types:
            result.sentiment = self.analyze_sentiment(text)
        if "entities" in analysis_types:
            result.entities = self.extract_entities(text)
        if "summary" in analysis_types:
            result.summary = self.summarize(text)
        if "keywords" in analysis_types:
            result.keywords = self.extract_keywords(text)
        return result


PROCESSOR = NLPProcessor()


def _ok(data: Any, request_id: Any = None) -> Dict[str, Any]:
    return {"id": request_id, "status": "success", "data": data, "message": None}


def _err(message: str, request_id: Any = None) -> Dict[str, Any]:
    return {"id": request_id, "status": "error", "data": None, "message": message}


def handle_native_action(action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Native-host protocol: map Rust MlRequest actions to payloads."""
    text = params.get("text", "") or ""

    if action == "heartbeat":
        return _ok({"status": "alive"})

    if action == "analyze_sentiment":
        return _ok(PROCESSOR.analyze_sentiment(text))

    if action == "extract_entities":
        return _ok(PROCESSOR.extract_entities(text))

    if action == "summarize":
        max_length = params.get("max_length")
        n = max_length if isinstance(max_length, int) and max_length > 0 else 3
        return _ok({"summary": PROCESSOR.summarize(text, n)})

    if action == "extract_keywords":
        top_k = params.get("top_k")
        k = top_k if isinstance(top_k, int) and top_k > 0 else 5
        return _ok(PROCESSOR.extract_keywords(text, k))

    if action == "generate_embedding":
        return _ok(PROCESSOR.generate_embedding(text))

    if action == "query_rag":
        query = params.get("query", "") or ""
        top_k = params.get("top_k")
        k = top_k if isinstance(top_k, int) and top_k > 0 else 5
        return _ok({"query": query, "results": [], "top_k": k})

    if action == "store_document":
        meta = params.get("meta")
        return _ok({"stored_count": 1 if text else 0, "meta": meta})

    if action == "generate_response":
        prompt = params.get("prompt", "") or ""
        answer = PROCESSOR.summarize(prompt, 2) if prompt else ""
        return _ok({"response": answer})

    return _err(f"unknown action: {action}")


def handle_jsonrpc(method: str, params: Dict[str, Any], request_id: Any) -> Dict[str, Any]:
    if method in ("ping", "initialize"):
        return {"id": request_id, "result": {"pong": True, "initialized": PROCESSOR.initialized}}

    if method == "process_text":
        text = params.get("text", "")
        types = params.get("analysis_types", ["summary"])
        language = params.get("language", "en")
        return {"id": request_id, "result": asdict(PROCESSOR.process(text, types, language))}

    if method in ("sentiment", "analyze_sentiment"):
        return {"id": request_id, "result": PROCESSOR.analyze_sentiment(params.get("text", ""))}

    if method in ("entities", "extract_entities"):
        return {"id": request_id, "result": PROCESSOR.extract_entities(params.get("text", ""))}

    if method in ("summary", "summarize"):
        return {"id": request_id, "result": {"summary": PROCESSOR.summarize(params.get("text", ""))}}

    if method in ("keywords", "extract_keywords"):
        return {"id": request_id, "result": PROCESSOR.extract_keywords(params.get("text", ""))}

    if method in ("embed", "generate_embedding"):
        return {"id": request_id, "result": PROCESSOR.generate_embedding(params.get("text", ""))}

    return {"id": request_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def handle_request(request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    request_id = request.get("id")
    if "action" in request:
        return handle_native_action(request["action"], request)
    if "method" in request:
        return handle_jsonrpc(request["method"], request.get("params", {}) or {}, request_id)
    return {"id": request_id, "status": "error", "data": None, "message": "missing 'action' or 'method'"}


def serve() -> None:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"id": None, "status": "error", "data": None,
                              "message": f"parse error: {exc}"}), flush=True)
            continue

        if not isinstance(request, dict):
            print(json.dumps({"id": None, "status": "error", "data": None,
                              "message": "request must be a JSON object"}), flush=True)
            continue

        try:
            response = handle_request(request)
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            response = {"id": request.get("id"), "status": "error", "data": None,
                        "message": f"internal error: {exc}"}

        if response is not None:
            print(json.dumps(response), flush=True)


def selftest() -> int:
    sample = "I love this great browser. It is fast and reliable. Mail me at dev@example.com for $20 on 2026-10-16."
    failures = []
    if PROCESSOR.analyze_sentiment(sample)["positive"] <= PROCESSOR.analyze_sentiment(sample)["negative"]:
        failures.append("sentiment")
    if not PROCESSOR.extract_entities(sample):
        failures.append("entities")
    if not PROCESSOR.summarize(sample):
        failures.append("summary")
    if not PROCESSOR.extract_keywords(sample):
        failures.append("keywords")
    if len(PROCESSOR.generate_embedding(sample)) != EMBEDDING_DIM:
        failures.append("embedding")
    if failures:
        print("SELFTEST FAILED: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("SELFTEST OK")
    return 0


def main() -> None:
    PROCESSOR.initialize()
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    serve()


if __name__ == "__main__":
    main()