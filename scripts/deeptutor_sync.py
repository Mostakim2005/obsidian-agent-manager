#!/usr/bin/env python3
"""Sync pinned Obsidian notes, links, PDFs, and converted EPUBs into a DeepTutor KB."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

import httpx
from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub


def convert_epub_to_markdown(epub_path: Path, staging_dir: Path) -> Path:
    staging_dir.mkdir(parents=True, exist_ok=True)
    out_md = staging_dir / f"{epub_path.stem}.md"
    book = epub.read_epub(str(epub_path))
    sections: list[str] = [f"# {epub_path.stem}\n"]
    for idx, item in enumerate(book.get_items_of_type(ITEM_DOCUMENT), start=1):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text(separator="\n", strip=True)
        if text:
            sections.append(f"\n## Section {idx}\n\n{text}\n")
    out_md.write_text("\n".join(sections), encoding="utf-8")
    return out_md


def fetch_bridge_paths(bridge_url: str, token: str, from_inbox: bool, include_links: bool) -> list[Path]:
    headers = {"Authorization": f"Bearer {token}"}
    paths: list[Path] = []
    with httpx.Client(timeout=15.0) as client:
        if from_inbox:
            resp = client.get(f"{bridge_url}/inbox", headers=headers)
            resp.raise_for_status()
            for item in resp.json().get("items", []):
                if item.get("diskPath"):
                    paths.append(Path(item["diskPath"]))
        else:
            ctx_resp = client.get(f"{bridge_url}/context", headers=headers)
            ctx_resp.raise_for_status()
            ctx = ctx_resp.json()
            active = ctx.get("activeFile") or {}
            if active.get("diskPath"):
                paths.append(Path(active["diskPath"]))

            att_resp = client.get(f"{bridge_url}/context/attachments", headers=headers)
            att_resp.raise_for_status()
            for a in att_resp.json().get("attachments", []):
                if a.get("diskPath"):
                    paths.append(Path(a["diskPath"]))

            if include_links and active.get("vaultPath"):
                graph_resp = client.get(
                    f"{bridge_url}/note/graph",
                    params={"path": active["vaultPath"]},
                    headers=headers,
                )
                graph_resp.raise_for_status()
                for link in graph_resp.json().get("outgoing", []):
                    if link.get("diskPath"):
                        paths.append(Path(link["diskPath"]))

    seen: set[Path] = set()
    unique: list[Path] = []
    for p in paths:
        if p.exists() and p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


def ingest_into_deeptutor(kb_name: str, files: list[Path]) -> None:
    if not files:
        print("No files to ingest.")
        return
    staging = Path(".obsidian-agent-manager-staging")
    docs_to_add: list[str] = []
    for f in files:
        if f.suffix.lower() == ".epub":
            md = convert_epub_to_markdown(f, staging)
            docs_to_add.append(str(md.resolve()))
        else:
            docs_to_add.append(str(f.resolve()))

    check = subprocess.run(["deeptutor", "kb", "info", kb_name], capture_output=True, text=True)
    subcmd = "add" if check.returncode == 0 else "create"
    cmd = ["deeptutor", "kb", subcmd, kb_name]
    for doc in docs_to_add:
        cmd.extend(["--doc", doc])
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)


def search_deeptutor_kb(kb_name: str, query: str) -> None:
    cmd = ["deeptutor", "kb", "search", kb_name, query, "--mode", "hybrid", "--format", "json"]
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Push Obsidian Agent Manager context/inbox to DeepTutor KB.")
    parser.add_argument("--kb", required=True, help="Target DeepTutor knowledge base name")
    parser.add_argument("--manager-url", "--bridge-url", dest="manager_url", default="http://127.0.0.1:27125", help="Obsidian Agent Manager URL")
    parser.add_argument("--token", default=os.environ.get("OBSIDIAN_AGENT_MANAGER_TOKEN") or os.environ.get("OBSIDIAN_BRIDGE_TOKEN", ""), help="Agent Manager Bearer token")
    parser.add_argument("--from-inbox", action="store_true", help="Sync pinned right-click inbox items")
    parser.add_argument("--include-links", action="store_true", help="Also ingest outgoing wikilinks of the active note")
    parser.add_argument("--search", default="", help="Run a hybrid search query against the KB instead of ingesting")
    args = parser.parse_args()

    if args.search:
        search_deeptutor_kb(args.kb, args.search)
        return 0

    if not args.token:
        print("Error: set --token, OBSIDIAN_AGENT_MANAGER_TOKEN, or OBSIDIAN_BRIDGE_TOKEN", file=sys.stderr)
        return 1

    files = fetch_bridge_paths(args.manager_url, args.token, args.from_inbox, args.include_links)
    ingest_into_deeptutor(args.kb, files)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
