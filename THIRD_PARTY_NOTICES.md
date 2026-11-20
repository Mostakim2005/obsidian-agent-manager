# Third-Party Notices

This project incorporates third-party open-source components and patterns under their respective licenses.

## Ships inside the app / Runtime dependencies

| Component | License | Project / Upstream URL | Notes |
| :--- | :--- | :--- | :--- |
| `obsidian` | MIT | [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api) | Official Obsidian plugin API interfaces |
| `DeepTutor` integration patterns | Apache-2.0 | [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) | Knowledge base ingestion and hybrid RAG configuration patterns |
| `ebooklib` | LGPL-3.0 / AGPL-3.0 | [aerkalov/ebooklib](https://github.com/aerkalov/ebooklib) | Used in `scripts/deeptutor_sync.py` for EPUB chapter parsing |
| `beautifulsoup4` | MIT | [crummy.com/software/BeautifulSoup](https://www.crummy.com/software/BeautifulSoup/) | HTML/EPUB sanitization and text extraction |
| `httpx` | BSD-3-Clause | [encode/httpx](https://github.com/encode/httpx) | Python HTTP client for bridge communication |

## Build / test only — not shipped

| Component | License | Project / Upstream URL | Notes |
| :--- | :--- | :--- | :--- |
| `typescript` | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | TypeScript compiler for static type checking |
| `esbuild` | MIT | [evanw/esbuild](https://github.com/evanw/esbuild) | Bundler for producing single-file `main.js` |
| `@types/node` | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | Node.js type declarations |
| `vitest` | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | Unit testing framework |
