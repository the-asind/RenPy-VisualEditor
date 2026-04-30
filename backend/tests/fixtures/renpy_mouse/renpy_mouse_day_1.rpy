# Mouse RenPy, day 1: the crumb map begins.
define r = Character("RenPy")
default crumb_count = 0

label start:
    # RenPy wakes up under the keyboard.
    scene kitchen morning
    show renpy curious at left with dissolve
    r "I smell a cheese commit."
    "The tiny editor cursor blinks like a lighthouse."

    menu:
        "Which snack path should RenPy inspect?"
        "Follow the golden crumb trail" if crumb_count == 0:
            $ crumb_count += 1
            jump .crumb_trail
        "Ask the rubber duck for review":
            call ask_duck("lint") from start_after_duck
            jump day_two

label .crumb_trail:
    r "The crumbs form arrows. Suspiciously good arrows."
    if crumb_count > 2:
        r "This is either a feast or a cycle."
    elif crumb_count == 1:
        r "One crumb is enough for a prototype."
    else:
        r "No crumbs, no graph."

    show renpy happy at right with hpunch
    jump day_two.cheese_cache

label ask_duck(topic="crumbs"):
    # The duck says nothing, which RenPy treats as approval.
    r "Duck, please review my [topic]."
    return "quack"