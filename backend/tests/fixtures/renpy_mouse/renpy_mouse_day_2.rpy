# Mouse RenPy, day 2: cross-file cheese logistics.
image renpy happy = "renpy_happy.png"

label day_two:
    # Presentation and timing statements should stay action/raw nodes.
    scene pantry dusk
    play music "tiny_footsteps.ogg" fadein 1.0
    r "A second file, a single monster canvas."

    call cheese_count(crumb_count) from day_two_after_count
    jump .cheese_cache

label .cheese_cache:
    r "The cache contains exactly one heroic cheese cube."
    show renpy happy:
        xalign 0.5
        yalign 1.0
        linear 0.2 yoffset -10
        linear 0.2 yoffset 0

    python:
        renpy_note = "raw python block survives the graph"
        crumb_count += 1

    menu midnight_choice:
        "What should RenPy do with the cheese?"
        "Export it carefully":
            jump ending_export
        "Call a dynamic snack route":
            $ next_snack_label = "ending_dynamic"
            call expression next_snack_label pass (crumb_count)
            return

label cheese_count(amount=0):
    r "Counting [amount] crumbs before touching the cheese."
    return amount

label ending_export:
    with dissolve
    r "Stable export tastes better than exact whitespace."
    return

label ending_dynamic:
    r "Dynamic labels are slippery, but not fatal."
    return