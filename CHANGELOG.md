# Changelog

User-visible changes to RenPy Visual Editor are recorded here.

## Unreleased — Public Beta Preparation

### Added

- One ProjectGraph canvas for all `.rpy` files, global/local labels, label-start nodes and scenario nodes.
- Structured editing for narrative actions, menus, conditions, jumps, calls and returns.
- Loro CRDT persistence and multi-client WebSocket collaboration.
- Search, Problems, normalized multi-file export and Chromium local-project import/write-back.
- Clockwork Library landing preview and personal demo project.
- Prometheus application metrics and provisioned Grafana dashboards for local operations.
- Working canvas links for the public Quick Start and GitHub bug-report form.

### Changed

- Release documentation now targets users and contributors instead of the internal development branch.
- Project listing now includes projects owned directly through `projects.owner_id` even when no duplicate owner row exists in `project_access`.
- Anonymous demo preview serves committed JSON and no longer runs the importer, resolver or Node/Loro snapshot bridge during requests.
- Multiple WebSocket tabs for one user are tracked and disconnected independently.
- Application and observability containers bind to loopback behind nginx; the observability stack can run independently on a second VPS.

### Security

- Retired legacy script HTTP and WebSocket routes are no longer exposed by the application.
- Project WebSockets enforce incoming text size and per-connection message/byte budgets, with session cleanup on forced closure.
- Anonymous demo preview serves prebuilt JSON without runtime import, resolution or snapshot generation.

- Production configuration requires an explicit JWT secret and CORS origin list.
- ProjectGraph import, snapshot, export, bridge and binary WebSocket operations have payload or execution limits.
- Viewer WebSocket sessions can observe collaboration presence but cannot relay binary CRDT updates.
- Each account may own at most 10 projects by default, including personal demo copies; the atomic database check also covers concurrent creates.
- Registration, login, project creation and anonymous demo preview have per-IP application rate limits.
- WebSocket sessions have per-user and per-project connection caps.
- The supplied nginx configuration enforces a 12 MB request-body ceiling, shared per-IP request/connection limits and an allowlisted metrics bridge for the observability VPS.
- Axios and React Router were updated so the production npm audit has no high or critical findings as of this preparation pass.

### Known Before Public Launch

- Complete split-VPS deployment, backup/restore and delivered-alert checks.
- Select and add the project license.
