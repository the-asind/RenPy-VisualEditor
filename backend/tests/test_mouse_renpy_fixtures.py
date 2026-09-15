from pathlib import Path

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def read_fixture(name: str) -> str:
    return (FIXTURE_DIR / name).read_text(encoding="utf-8")


def test_mouse_renpy_fixture_corpus_exists():
    expected_files = {
        "renpy_mouse_day_1.rpy",
        "renpy_mouse_day_2.rpy",
        "renpy_mouse_diagnostics.rpy",
        "renpy_mouse_nested_if_blocks.rpy",
    }

    assert expected_files == {path.name for path in FIXTURE_DIR.glob("*.rpy")}


def test_mouse_renpy_fixture_corpus_covers_mvp_parser_invariants():
    corpus = "\n".join(path.read_text(encoding="utf-8") for path in sorted(FIXTURE_DIR.glob("*.rpy")))

    required_fragments = [
        "label start:",
        "label .crumb_trail:",
        "label day_two:",
        "label .cheese_cache:",
        "label ask_duck(topic=\"crumbs\"):",
        "r \"I smell a cheese commit.\"",
        "menu:",
        "\"Which snack path should RenPy inspect?\"",
        "\"Follow the golden crumb trail\" if crumb_count == 0:",
        "if crumb_count > 2:",
        "if secret_duck_mode:",
        "elif crumb_count == 1:",
        "else:",
        "jump .crumb_trail",
        "jump day_two.cheese_cache",
        "call ask_duck(\"lint\") from start_after_duck",
        "call expression next_snack_label pass (crumb_count)",
        "return \"quack\"",
        "# RenPy wakes up under the keyboard.",
        "scene kitchen morning",
        "show renpy happy:",
        "python:",
        "label duplicate_cheese:",
        "jump missing_cheese_label",
        "jump expression suspicious_target",
        "while crumb_count < 3:",
    ]

    for fragment in required_fragments:
        assert fragment in corpus


def test_mouse_renpy_fixture_corpus_has_multi_file_flow_targets():
    day_1 = read_fixture("renpy_mouse_day_1.rpy")
    day_2 = read_fixture("renpy_mouse_day_2.rpy")

    assert "jump day_two.cheese_cache" in day_1
    assert "label day_two:" in day_2
    assert "label .cheese_cache:" in day_2


def test_mouse_renpy_diagnostics_fixture_contains_non_blocking_problem_cases():
    diagnostics = read_fixture("renpy_mouse_diagnostics.rpy")

    assert diagnostics.count("label duplicate_cheese:") == 2
    assert "jump missing_cheese_label" in diagnostics
    assert "jump expression suspicious_target" in diagnostics
    assert "while crumb_count < 3:" in diagnostics
