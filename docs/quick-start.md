# Quick Start

## Try The Canvas

Open the landing page and explore the Clockwork Library preview. The preview uses the same ProjectGraph canvas as an imported project, but edits made there are local to the page.

Create an account when you want to save a project. From the project menu you can create an empty project, create a personal copy of the demo, or import a local Ren'Py project.

## Import A Ren'Py Project

1. Make a backup of the Ren'Py project.
2. In a Chromium browser, choose the project root that contains the `game` directory.
3. Review the discovered `.rpy` files and asset catalog, then import.
4. Review Problems for unresolved or dynamic references. Warnings can describe valid Ren'Py that the editor cannot resolve statically.

Binary images, audio, video and fonts remain on the local computer. The server receives `.rpy` text and a catalog of asset names and paths so the editor can offer local previews.

## Edit And Navigate

- Select a scenario node to open the Action Editor.
- Use Search and Problems to focus nodes anywhere on the project canvas.
- Drag file frames, label frames and nodes to keep a useful manual layout.
- `jump` and `call` relations point to the destination label-start node. Moving a label does not change its lexical file or parent label.
- Open the same project in another authenticated browser session to collaborate.

Changes are saved to the project's CRDT snapshot. Wait for the saved/connected indicator before closing the last tab.

## Export

Use Export to produce normalized `.rpy` files. Blocking diagnostics stop unsafe export; warnings remain visible without necessarily blocking it. Editor layout and collaboration metadata are never written into `.rpy` files.

When writing files back to a local `game` directory, review the manifest of changed and new files. The editor does not delete local files automatically.

## Current Beta Limits

- Local directory access requires a Chromium browser and explicit directory permission.
- Exact original whitespace and formatting are not preserved; export is normalized.
- Dynamic label references and arbitrary Python cannot always be resolved statically.
- Very large projects have not yet completed the planned deterministic 5,000/20,000-node capacity gate.

If something fails, preserve a copy of the source project and use the bug-report issue form. Include the smallest reproducible `.rpy` example you are comfortable making public; do not attach private scripts, tokens or private project links.

## Local Development

Backend (Python 3.11):

```sh
python -m pip install -r backend/requirements.lock.txt
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 9000
```

Frontend (Node.js 20):

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Set the frontend API and WebSocket URLs through the variables documented in `example.env`.
