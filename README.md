# Plotmio

Plotmio turns a Ren'Py project into one collaborative visual canvas. Files and labels remain visible as frames, narrative statements become editable nodes, and `jump`/`call` relations connect the flow across files.

The project is preparing for a public beta. The core MVP 2 workflow works locally; production hosting, abuse limits and public feedback links are being completed before the wider announcement.

## What It Does

- Imports the `.rpy` files from a Ren'Py project's `game` directory.
- Displays files, global and nested labels, choices, conditions and narrative flow on one canvas.
- Edits structured actions and preserved Ren'Py source without exporting editor metadata.
- Synchronizes one project graph between browser sessions through a Loro CRDT document.
- Searches the current graph, reports import/export diagnostics and exports normalized `.rpy` files.
- Keeps image, audio and other binary assets on the user's computer; the server stores only `.rpy` content and a text asset catalog.

The local-directory workflow currently requires a Chromium browser with the File System Access API. Back up a project before writing exported files into its `game` directory.

## Run With Docker

Requirements: Docker Engine with Docker Compose.

1. Copy `example.env` to `.env`.
2. Replace `JWT_SECRET_KEY` with a long random value.
3. Start the application:

```sh
docker compose up --build
```

Open <http://localhost:5137>. The API listens on <http://localhost:9000> in this local configuration.

See [Quick Start](docs/quick-start.md) for the product workflow and local development commands.

## Demo Content

The Clockwork Library demo scripts, images and audio were generated with AI specifically to demonstrate this editor, as confirmed by the project creator. They are fictional demonstration content. The project's Apache 2.0 license applies to bundled project content to the extent copyright applies; third-party dependencies retain their own licenses. The demo does not require purchasing external media.

## Verify A Change

```sh
python -m pytest backend/tests -q
cd frontend
npm ci
npm test -- --run
npm run build
npm run check:mvp-bundle
npm run test:e2e
```

The current MVP bundle gate permits a largest JavaScript chunk of 6,000,000 bytes. Reducing the Loro-heavy initial bundle remains a post-beta performance task.

## Contributing And Support

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the project graph, parser, collaboration or export paths.
- Use the GitHub issue forms for reproducible bugs and feature proposals.
- Report security problems privately as described in [SECURITY.md](SECURITY.md).
- User-visible changes are summarized in [CHANGELOG.md](CHANGELOG.md).

## License

Copyright 2026 the-asind and contributors.

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for attribution. Third-party dependencies retain their respective licenses.
