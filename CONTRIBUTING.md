# Contributing

Thanks for helping make Plotmio useful to visual-novel authors. Start with an issue for changes that alter the project graph, parser semantics, collaboration protocol or export behavior so the intended result can be agreed before a large implementation.

## Architecture Rules

- The persisted ProjectGraph in one Loro document is the source of truth for a project. React Flow is its projection and interaction layer.
- File and label containment describes lexical Ren'Py structure. Runtime flow does not move labels between containers.
- Every label has a visible label-start node. `jump` and `call` edges target that node; edges never connect frames.
- Stable entity IDs are persisted and reused after import.
- Valid non-branching or unknown Ren'Py is preserved as editable action/source content when possible. It is not a graph error by default.
- Comments remain visible with their related block. Editor metadata is never exported to `.rpy`.
- Export favors stable normalized source over preservation of original formatting.

## Change Process

Use a black-box test for each behavior change:

1. Describe the user-visible expectation.
2. Add or update a Ren'Py fixture when parser or export behavior changes.
3. Make the focused test fail for the missing behavior.
4. Implement the smallest complete path.
5. Run the focused tests, then the affected integration suites.
6. Update public documentation and `CHANGELOG.md` when behavior changes.

Parser and round-trip fixtures should extend the existing continuous story about a mouse named RenPy instead of creating unrelated miniature corpora.

Before removing legacy code, classify it as keep, adapt, replace or delete. Delete a replaced path only after tests show the current product no longer uses it.

## Checks

From the repository root:

```sh
python -m pytest backend/tests -q
cd frontend
npm ci
npm test -- --run
npm run build
npm run check:mvp-bundle
npm run test:e2e
```

Do not commit `.env` files, databases, user scripts, access tokens, logs, generated builds or test artifacts.

The anonymous demo uses the committed `backend/app/demo_assets/clockwork-library/v1/preview.json` artifact. After changing its source scripts, ProjectGraph backend implementation or project routes, regenerate it with `python backend/scripts/build_demo_preview.py` and commit the result. CI runs the same command with `--check` to reject stale inputs. Preview requests serve these bytes without parsing Ren'Py or starting Node; authenticated demo copies still use the normal import path.

## License

Frontend builds generate `/THIRD_PARTY_NOTICES.txt` from installed production packages. Supplementary upstream license texts and sources live in `frontend/licenses/`. If generation reports a missing license, add its full upstream text and a version-specific override rather than dropping the notice.

Unless explicitly stated otherwise, contributions intentionally submitted for inclusion in this project are licensed under the [Apache License, Version 2.0](LICENSE), as described in section 5. Contributors retain copyright in their contributions.
