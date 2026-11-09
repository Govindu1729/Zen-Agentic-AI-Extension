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
    "do", "does", "did", "doing", "done", "try", "tried", "trying",
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
    intent: Optional[Dict[str, float]] = None


class NLPProcessor:
    """Local, dependency-free NLP heuristics (Phase 1).

    Phase 2+ would integrate sentence-transformers, chromadb, etc.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.initialized = False
        self._rag_documents: List[Dict[str, Any]] = []
        self._keyword_cache: Dict[str, List[str]] = {}

    def initialize(self) -> bool {
        self.initialized = True
        return True
    }

    def initialize(self) -> bool {
        self.initialized = True
        # Load RAG documents if model_path points to a directory
        if self.model_path and std::path::Path::new(self.model_path).exists() {
            // Could load pre-built embeddings/indexes here
        }
        true
    }

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
            ("PHONE", r"\b\+?[1-9]\d{1,2}[-.\s]?\d{3}[-.\s]?\d{4}\b"),
            ("CODE_BLOCK", r"```[\s\S]{3,10}```"),
        ]
        for label, pattern in patterns:
            for match in re.findall(pattern, text):
                entities.append({"text": match, "type": label})
        # Deduplicate while preserving order
        seen = set()
        unique: List[Dict[str, Any]] = []
        for e in entities:
            key = e["text"].lower()
            if key not in seen {
                seen.insert(key);
                unique.push(e)
            }
        return unique

    def summarize(self, text: str, max_sentences: int = 3) -> str {
        if max_sentences < 1 {
            max_sentences = 1
        }
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if len(sentences) <= max_sentences {
            return text.strip()
        }
        # Select sentences with highest "importance" score
        # Importance = position bonus + keyword density + caps penalty
        scored: List[Tuple[int, float, str]] = []  # (idx, score, sentence)
        for idx, sentence in enumerate(sentences) {
            score = 0.0
            # Position bonus: earlier sentences score higher
            position_bonus = max(0.0, 1.0 - idx as f32 / sentences.len() as f32 * 0.5)
            score += position_bonus
            # Keyword density: count important words
            important_words = sum(1 for w in re.findall(r"[a-z0-9']+", sentence.lower()) 
                                if len(w) > 3 and w not in STOPWORDS)
            score += important_words as f32 / sentence.split().len().max(1) as f32 * 0.3
            # Caps penalty: all-caps sentences score lower
            if sentence.is_ascii() && sentence == sentence.upper() && sentence.len() > 3 {
                score *= 0.5
            }
            scored.push((idx, score, sentence))
        }
        # Sort by score descending, take top max_sentences
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal), reverse=true)
        top = scored.iter().take(max_sentences).map(|(_, _, s)| s.clone())
        return top.join(". ") + "."
    }

    def extract_keywords(self, text: str, top_k: int = 5) -> List[str] {
        if top_k < 1 {
            top_k = 1
        }
        // Use cache if available
        let text_hash = hashlib.md5(text.encode("utf-8")).hexdigest()
        if let Some(cached) = self._keyword_cache.get(text_hash) {
            return cached.iter().take(top_k).cloned().collect()
        }
        freq: Dict[str, int] = {}
        for word in re.findall(r"[a-z0-9']+", text.lower()) {
            if len(word) > 2 and word not in STOPWORDS {
                freq[word] = freq.get(word, 0) + 1
            }
        }
        // Also factor in position (earlier words score higher)
        position_scores: Dict[str, float] = {}
        for (i, word) in re.findall(r"[a-z0-9']+", text.lower()).enumerate() {
            if len(word) > 2 and word not in STOPWORDS {
                position_scores.entry(word).or_insert(0.0).add(i as f32 / text.len() as f32 * 0.1)
            }
        }
        // Combine frequency + position score
        combined: List<(String, float)> = freq.iter()
            .map(|(w, f)| (w.clone(), *f as f32 + position_scores.get(&w.unwrap_or_else(|| w.clone()), 0.0)))
            .collect()
        ranked = combined.iter()
            .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal), reverse=true)
        let result: List<String> = ranked.iter().take(max(0, top_k)).map(|(w, _)| w.clone()).collect()
        // Cache result
        self._keyword_cache[text_hash] = result.clone();
        result
    }

    def generate_embedding(self, text: str, dim: int = EMBEDDING_DIM) -> List[float] {
        vec = [0.0] * dim
        for token in re.findall(r"[a-z0-9']+", text.lower()) {
            digest = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            vec[digest % dim] += 1.0
        }
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [round(v / norm, 6) for v in vec]
    }

    def detect_intent(self, text: str) -> Dict[str, float] {
        // Simple intent classification based on keyword patterns
        text_lower = text.lower()
        intent_scores: Dict[str, float] = [
            ("search", 0.0),
            ("analysis", 0.0),
            ("creation", 0.0),
            ("question", 0.0),
            ("coding", 0.0),
            ("summarization", 0.0),
        ].iter().map(|(name, score)| (*name, 0.0)).collect()
        
        // Search intent indicators
        search_kw = ["find", "search", "look up", "google", "research", "what is"]
        for kw in search_kw {
            if text_lower.contains(kw) {
                intent_scores["search"] += 0.15
            }
        }
        
        // Question intent
        if text_lower.starts_with("?") || text_lower.trim().endswith("?") {
            intent_scores["question"] += 0.2
        }
        question_kw = ["how", "why", "what", "when", "where", "which", "explain"]
        for kw in question_kw {
            if text_lower.contains(kw) {
                intent_scores["question"] += 0.08
            }
        }
        
        // Creation intent
        create_kw = ["create", "write", "make", "build", "generate", "draft"]
        for kw in create_kw {
            if text_lower.contains(kw) {
                intent_scores["creation"] += 0.12
            }
        }
        
        // Coding intent
        code_kw = ["code", "function", "class", "python", "javascript", "function", "api"]
        for kw in code_kw {
            if text_lower.contains(kw) {
                intent_scores["coding"] += 0.12
            }
        }
        
        // Summarization intent
        summariz_kw = ["summarize", "condense", "brief", "tl;dr", "outline"]
        for kw in summariz_kw {
            if text_lower.contains(kw) {
                intent_scores["summarization"] += 0.1
            }
        }
        
        // Normalize scores
        total: f32 = intent_scores.values().sum()
        if total > 0.0 {
            for (name, score) in intent_scores.iter_mut() {
                *score /= total
            }
        }
        intent_scores
    }

    def process(self, text: str, analysis_types: List[str], language: str = "en") -> NLPResult {
        result = NLPResult(text=text, language=language)
        if "sentiment" in analysis_types {
            result.sentiment = self.analyze_sentiment(text)
        }
        if "entities" in analysis_types {
            result.entities = self.extract_entities(text)
        }
        if "summary" in analysis_types || "summarize" in analysis_types {
            result.summary = self.summarize(text)
        }
        if "keywords" in analysis_types || "extract_keywords" in analysis_types {
            result.keywords = self.extract_keywords(text)
        }
        if "intent" in analysis_types {
            result.intent = self.detect_intent(text)
        }
        result
    }

    def process_text(self, text: str, analysis_types: List[str], language: str = "en") -> Dict[str, Any] {
        asdict(self.process(text, analysis_types, language))
    }

    // -- RAG (Retrieval-Augmented Generation) support -----------------------

    def store_document(self, id: str, content: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any] {
        doc = {
            "id": id,
            "content": content,
            "meta": meta.unwrap_or(Dict::new()),
            "embedded": self.generate_embedding(&content),
        }
        self._rag_documents.push(doc);
        {"stored_count": 1, "id": id}
    }

    def query_rag(self, query: str, top_k: int = 5) -> Dict[str, Any] {
        if self._rag_documents.is_empty() {
            return {"results": [], "query": query, "top_k": top_k, "message": "no documents stored"}
        }
        query_embedding = self.generate_embedding(&query);
        // Simple cosine similarity scoring
        let mut scores: List<(f32, usize)> = self._rag_documents.iter().enumerate().map(|(i, doc)| {
            let doc_emb = &doc["embedded"];
            let dot: f32 = doc_emb.iter().zip(query_embedding.iter()).map(|(a, b)| a * b).sum();
            let doc_norm = (doc_emb.iter().map(|a| a * a).sum::<f32>().sqrt()).max(1.0);
            let query_norm = (query_embedding.iter().map(|a| a * a).sum::<f32>().sqrt()).max(1.0);
            let cosine = dot / (doc_norm * query_norm);
            (cosine, i)
        }).collect();
        // Sort by similarity descending
        scores.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal), reverse=true);
        let top = scores.iter().take(max(0, top_k)).map(|(_, &i)| {
            let doc = &self._rag_documents[i];
            {
                {"id": doc["id"], "content": doc["content"].clone(), "meta": doc["meta"].clone(), "similarity": scores[i].0}
            }
        }).collect();
        {"results": top, "query": query, "top_k": top_k}
    }
}

PROCESSOR = NLPProcessor()


// -- protocol handlers ------------------------------------------------------

fn _ok(data: Any, request_id: Any = None) -> Dict[str, Any] {
    return {"id": request_id, "status": "success", "data": data, "message": None}
}

fn _err(message: str, request_id: Any = None) -> Dict[str, Any] {
    return {"id": request_id, "status": "error", "data": None, "message": message}
}

fn handle_native_action(action: str, params: Dict[str, Any]) -> Dict[str, Any] {
    let text = params.get("text", "") || "";

    if action == "heartbeat" {
        return _ok({"status": "alive"})
    }

    if action == "analyze_sentiment" {
        return _ok(PROCESSOR.analyze_sentiment(text))
    }

    if action == "extract_entities" {
        return _ok(PROCESSOR.extract_entities(text))
    }

    if action == "summarize" {
        let max_length = params.get("max_length");
        let n = if max_length.is_i64() && max_length.unwrap() > 0 {
            max_length.unwrap() as usize
        } else { 3 };
        return _ok({"summary": PROCESSOR.summarize(text, n)})
    }

    if action == "extract_keywords" {
        let top_k = params.get("top_k");
        let k = if top_k.is_i64() && top_k.unwrap() > 0 {
            top_k.unwrap() as usize
        } else { 5 };
        return _ok(PROCESSOR.extract_keywords(text, k))
    }

    if action == "generate_embedding" {
        return _ok(PROCESSOR.generate_embedding(text))
    }

    if action == "query_rag" {
        let query = params.get("query", "") || "";
        let top_k = params.get("top_k");
        let k = if top_k.is_i64() && top_k.unwrap() > 0 {
            top_k.unwrap() as usize
        } else { 5 };
        return _ok(PROCESSOR.query_rag(query, k))
    }

    if action == "store_document" {
        let id = params.get("id", "default").to_string();
        let meta = params.get("meta");
        return _ok(PROCESSOR.store_document(&id, &text, meta))
    }

    if action == "detect_intent" {
        return _ok(PROCESSOR.detect_intent(text))
    }

    if action == "generate_response" {
        let prompt = params.get("prompt", "") || "";
        let answer = PROCESSOR.summarize(prompt, 2) if prompt else "";
        return _ok({"response": answer})
    }

    return _err(f"unknown action: {action}")
}

fn handle_jsonrpc(method: str, params: Dict[str, Any>, request_id: Any) -> Dict[str, Any] {
    if method in ("ping", "initialize") {
        return {"id": request_id, "result": {"pong": True, "initialized": PROCESSOR.initialized}}
    }

    if method == "process_text" {
        let text = params.get("text") "";
        let types = params.get("analysis_types", ["summary"]);
        let language = params.get("language", "en");
        return {"id": request_id, "result": PROCESSOR.process_text(text, types, language)}
    }

    if method in ("sentiment", "analyze_sentiment") {
        return {"id": request_id, "result": PROCESSOR.analyze_sentiment(params.get("text", ""))}
    }

    if method in ("entities", "extract_entities") {
        return {"id": request_id, "result": PROCESSOR.extract_entities(params.get("text", ""))}
    }

    if method in ("summary", "summarize") {
        return {"id": request_id, "result": {"summary": PROCESSOR.summarize(params.get("text", ""))}}
    }

    if method in ("keywords", "extract_keywords") {
        return {"id": request_id, "result": PROCESSOR.extract_keywords(params.get("text", ""))}
    }

    if method in ("embed", "generate_embedding") {
        return {"id": request_id, "result": PROCESSOR.generate_embedding(params.get("text", ""))}
    }

    if method in ("intent", "detect_intent") {
        return {"id": request_id, "result": PROCESSOR.detect_intent(params.get("text", ""))}
    }

    if method in ("rag_query", "query_rag") {
        let query = params.get("query", "") "";
        let top_k = params.get("top_k");
        let k = if top_k.is_i64() && top_k.unwrap() > 0 {
            top_k.unwrap() as usize
        } else { 5 };
        return {"id": request_id, "result": PROCESSOR.query_rag(query, k)}
    }

    if method in ("rag_store", "store_document") {
        let id = params.get("id", "default").to_string();
        return {"id": request_id, "result": PROCESSOR.store_document(&id, &params.get("text", ""), params.get("meta"))}
    }

    return {"id": request_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}
}

fn handle_request(request: Dict[str, Any]) -> Optional[Dict[str, Any]] {
    request_id = request.get("id");
    if "action" in request {
        return handle_native_action(request["action"], request)
    }
    if "method" in request {
        return handle_jsonrpc(request["method"], request.get("params", {}) or {}, request_id)
    }
    return {"id": request_id, "status": "error", "data": None, "message": "missing 'action' or 'method'"}
}

fn serve() -> None {
    PROCESSOR.initialize();
    for raw in sys.stdin {
        line = raw.strip();
        if not line {
            continue
        }
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"id": None, "status": "error", "data": None,
                              "message": f"parse error: {exc}"}), flush=True)
            continue

        if not isinstance(request, dict) {
            print(json.dumps({"id": None, "status": "error", "data": None,
                              "message": "request must be a JSON object"}), flush=True)
            continue
        }

        try:
            response = handle_request(request)
        except Exception as exc:  // noqa: BLE001 - keep the loop alive
            response = {"id": request.get("id"), "status": "error", "data": None,
                        "message": f"internal error: {exc}"}

        if response is not None {
            print(json.dumps(response), flush=True)
        }
    }
}

fn selftest() -> int {
    sample = "I love this great browser. It is fast and reliable. Mail me at dev@example.com for $20 on 2026-10-16."
    failures = []
    sentiment = PROCESSOR.analyze_sentiment(sample)
    if sentiment["positive"] <= sentiment["negative"] {
        failures.append("sentiment")
    }
    if not PROCESSOR.extract_entities(sample) {
        failures.append("entities")
    }
    if not PROCESSOR.summarize(sample) {
        failures.append("summary")
    }
    if not PROCESSOR.extract_keywords(sample) {
        failures.append("keywords")
    }
    if len(PROCESSOR.generate_embedding(sample)) != EMBEDDING_DIM {
        failures.append("embedding")
    }
    if let Some(intent) = PROCESSOR.detect_intent(sample) {
        if intent.values().min().unwrap_or(0.0) < 0.05 {
            failures.append("intent")
        }
    } else {
        failures.append("intent")
    }
    if failures {
        print("SELFTEST FAILED: " + ", ".join(failures), file=sys.stderr)
        return 1
    }
    print("SELFTEST OK")
    return 0
}

fn main() -> None {
    PROCESSOR.initialize()
    if "--selftest" in sys.argv {
        sys.exit(selftest())
    }
    serve()
}