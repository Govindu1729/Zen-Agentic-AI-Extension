#!/usr/bin/env python3
"""
End-to-end smoke test for the Zen Agentic Extension.

Exercises the pieces that actually broke in practice, without needing a browser:

  1. Native host binary exists and answers `ping` and `get_version` over the
     real 32-bit length-prefixed native-messaging protocol.
  2. Native host advertises the expected MCP tools (`list_mcp_tools`).
  3. ML backend speaks BOTH wire protocols correctly:
       - native mode  : {"action": ...} -> {"status","data","message"}
       - jsonrpc mode : {"method": ...} -> {"id","result"}
  4. Every JS file parses (node --check).
  5. manifest.json is valid JSON and every referenced icon/page file exists.

Exit code 0 only if every check passes.

Usage:
    python3 scripts/smoke_test.py
    python3 scripts/smoke_test.py --binary path/to/zen-agentic-native
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BINARY = ROOT / "native-host" / "target" / "release" / "zen-agentic-native"
ML_SCRIPT = ROOT / "ml-backend" / "nlp_processor.py"
WEBEXT = ROOT / "webextension"

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((PASS if ok else FAIL, name, detail))
    icon = "\u2713" if ok else "\u2717"
    print(f"  [{icon}] {name}" + (f" — {detail}" if detail else ""))


# -- native messaging protocol ---------------------------------------------

def encode(msg: dict) -> bytes:
    payload = json.dumps(msg).encode("utf-8")
    return struct.pack("<I", len(payload)) + payload


def read_frames(data: bytes) -> list[dict]:
    """Decode every length-prefixed JSON frame in a byte buffer."""
    frames, off = [], 0
    while off + 4 <= len(data):
        (length,) = struct.unpack("<I", data[off:off + 4])
        off += 4
        if off + length > len(data):
            break
        frames.append(json.loads(data[off:off + length].decode("utf-8")))
        off += length
    return frames


def run_native(binary: Path, requests: list[dict], timeout: int = 30) -> list[dict]:
    payload = b"".join(encode(r) for r in requests)
    proc = subprocess.run(
        [str(binary)],
        input=payload,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )
    return read_frames(proc.stdout)


# -- checks -----------------------------------------------------------------

def check_native(binary: Path) -> None:
    if not binary.exists():
        record("native host binary exists", False, f"missing: {binary}")
        return
    record("native host binary exists", True, str(binary))

    try:
        frames = run_native(binary, [
            {"id": "s1", "method": "ping", "params": {}},
            {"id": "s2", "method": "get_version", "params": {}},
            {"id": "s3", "method": "list_mcp_tools", "params": {}},
        ])
    except subprocess.TimeoutExpired:
        record("native host responds to requests", False, "timed out")
        return
    except Exception as exc:  # noqa: BLE001
        record("native host responds to requests", False, repr(exc))
        return

    by_id = {f.get("id"): f for f in frames}

    ping = by_id.get("s1", {})
    record("native ping responds",
           isinstance(ping.get("result"), dict) and ping["result"].get("pong") is True,
           json.dumps(ping.get("result")))

    ver = by_id.get("s2", {}).get("result") or {}
    record("native get_version responds", bool(ver.get("version")),
           f"version={ver.get('version')} target={ver.get('target')}")

    tools = by_id.get("s3", {}).get("result")
    if isinstance(tools, list):
        names = {t.get("name") for t in tools if isinstance(t, dict)}
        expected = {"take_snapshot", "extract_page_content", "get_page_analysis", "store_document"}
        missing = expected - names
        record("native advertises MCP tools", not missing,
               f"{len(names)} tools" + (f", missing {sorted(missing)}" if missing else ""))
    else:
        record("native advertises MCP tools", False, f"unexpected payload: {type(tools).__name__}")


def run_ml(lines: list[str]) -> list[dict]:
    proc = subprocess.run(
        [sys.executable, str(ML_SCRIPT)],
        input="".join(l + "\n" for l in lines),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
    )
    return [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]


def check_ml() -> None:
    if not ML_SCRIPT.exists():
        record("ML backend script exists", False, str(ML_SCRIPT))
        return
    record("ML backend script exists", True)

    # detect ModuleNotFound / syntax problems
    proc = subprocess.run([sys.executable, "-m", "py_compile", str(ML_SCRIPT)],
                          capture_output=True, text=True)
    record("ML backend compiles", proc.returncode == 0, proc.stderr.strip()[:120])

    # native protocol (what ml_bridge.rs actually sends/expects)
    try:
        out = run_ml([
            '{"action":"analyze_sentiment","text":"I love this great reliable browser"}',
            '{"action":"extract_entities","text":"reach me at a@b.com on 2026-10-16"}',
            '{"action":"summarize","text":"First sentence here. Second one follows. Third arrives. Fourth too."}',
            '{"action":"extract_keywords","text":"browser browser extension extension extension agent"}',
            '{"action":"generate_embedding","text":"embedding test"}',
            '{"action":"heartbeat"}',
        ])
    except Exception as exc:  # noqa: BLE001
        record("ML native-protocol responses", False, repr(exc))
        return

    ok_shape = all(
        isinstance(m, dict) and "status" in m and "data" in m and "message" in m
        for m in out
    )
    record("ML native-protocol shape {status,data,message}", ok_shape and len(out) == 6,
           f"{len(out)} responses")

    if len(out) == 6:
        sentiment, entities, summary, keywords, embedding, hb = out
        record("ML sentiment payload", isinstance(sentiment.get("data"), dict)
               and "positive" in sentiment["data"], str(sentiment.get("data")))
        record("ML entities payload", isinstance(entities.get("data"), list),
               f"{len(entities.get('data') or [])} entities")
        record("ML summary payload",
               isinstance(summary.get("data"), dict) and bool(summary["data"].get("summary")))
        # Rust expects Vec<String> for keywords -> data must be a list of strings
        kw = keywords.get("data")
        record("ML keywords payload (Vec<String>)",
               isinstance(kw, list) and all(isinstance(k, str) for k in kw), str(kw))
        # Rust expects Vec<f32> for embedding -> data must be a flat list of numbers
        emb = embedding.get("data")
        record("ML embedding payload (Vec<f32>)",
               isinstance(emb, list) and len(emb) > 0 and all(isinstance(v, (int, float)) for v in emb),
               f"dim={len(emb) if isinstance(emb, list) else '?'}")
        record("ML heartbeat", hb.get("status") == "success")

    # jsonrpc / documented protocol
    try:
        jout = run_ml([
            '{"id":"j1","method":"process_text","params":{"text":"Great product!","analysis_types":["sentiment","summary","keywords"]}}',
            '{"id":"j2","method":"ping","params":{}}',
        ])
        jj = {f.get("id"): f for f in jout}
        record("ML jsonrpc process_text",
               isinstance(jj.get("j1", {}).get("result"), dict), json.dumps(jj.get("j1", {}).get("result"))[:90])
        record("ML jsonrpc ping", jj.get("j2", {}).get("result", {}).get("pong") is True)
    except Exception as exc:  # noqa: BLE001
        record("ML jsonrpc protocol", False, repr(exc))


def check_js() -> None:
    files = [
        WEBEXT / "background.js",
        WEBEXT / "sidebar.js",
        WEBEXT / "content.js",
    ]
    for path in files:
        if not path.exists():
            record(f"{path.name} exists", False)
            continue
        proc = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        detail = "" if proc.returncode == 0 else (proc.stderr.splitlines() or [""])[0][:120]
        record(f"{path.name} parses", proc.returncode == 0, detail)


def check_manifest() -> None:
    path = WEBEXT / "manifest.json"
    if not path.exists():
        record("manifest.json exists", False)
        return
    try:
        manifest = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        record("manifest.json valid JSON", False, str(exc))
        return
    record("manifest.json valid JSON", True)

    missing = []
    for key in ("icons", "content_scripts", "background"):
        pass

    for size, rel in (manifest.get("icons") or {}).items():
        if not (WEBEXT / rel).exists():
            missing.append(rel)
    for size, rel in (manifest.get("sidebar_action", {}).get("default_icon") or {}).items():
        if not (WEBEXT / rel).exists():
            missing.append(rel)
    panel = manifest.get("sidebar_action", {}).get("default_panel")
    if panel and not (WEBEXT / panel).exists():
        missing.append(panel)
    for script in manifest.get("background", {}).get("scripts", []):
        if not (WEBEXT / script).exists():
            missing.append(script)
    for cs in manifest.get("content_scripts", []):
        for script in cs.get("js", []):
            if not (WEBEXT / script).exists():
                missing.append(script)

    record("manifest referenced files exist", not missing,
           "" if not missing else f"missing {sorted(set(missing))}")

    # Native messaging is registered via an OS-level manifest, NOT the extension
    # manifest. Validate that host manifest template here.
    host_manifest_path = ROOT / "zen_agentic_native.json"
    if not host_manifest_path.exists():
        record("native host manifest template exists", False, str(host_manifest_path))
        return
    try:
        host_manifest = json.loads(host_manifest_path.read_text())
    except json.JSONDecodeError as exc:
        record("native host manifest valid JSON", False, str(exc))
        return
    record("native host manifest valid JSON", True)

    record("native host name correct",
           host_manifest.get("name") == "zen_agentic_native",
           str(host_manifest.get("name")))
    record("native host type stdio",
           host_manifest.get("type") == "stdio",
           str(host_manifest.get("type")))

    ext_id = manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id")
    allowed = host_manifest.get("allowed_extensions", [])
    record("native host allows extension id",
           bool(ext_id) and ext_id in allowed,
           f"id={ext_id} allowed={allowed}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", default=str(DEFAULT_BINARY))
    args = parser.parse_args()

    print("=== Zen Agentic Extension — end-to-end smoke test ===")
    print("\n[native host]")
    check_native(Path(args.binary))
    print("\n[ML backend]")
    check_ml()
    print("\n[extension JS]")
    check_js()
    print("\n[manifest]")
    check_manifest()

    failed = [r for r in results if r[0] == FAIL]
    print("\n=== summary ===")
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("\nFailures:")
        for _, name, detail in failed:
            print(f"  - {name}: {detail}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())