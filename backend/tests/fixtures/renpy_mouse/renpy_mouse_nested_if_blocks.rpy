# Mouse RenPy, nested conditionals: the cheese maze folds inward.

label nested_if_maze:
    # RenPy Mouse enters the maze with too many tiny monologues.
    scene maze morning
    show renpy curious at center
    r "The first corridor smells like compiled cheese."
    r "The second corridor smells like a suspicious branch."
    r "The third corridor is just here to prove this stays one block."

    if cheese_compass_ready:
        r "The compass spins toward cheddar."
        if crumb_count > 3:
            scene maze_core afternoon
            r "The core has more crumbs than expected."
            if secret_duck_mode:
                r "The duck is wearing a tiny debugger."
            else:
                r "No duck debugger. Only crumbs."
        else:
            r "Three crumbs or fewer means the maze remains polite."
    else:
        if backup_duck_ready:
            r "The backup duck honks in YAML."
        else:
            r "RenPy Mouse writes TODO on a cheese rind."

    r "After the maze, the story becomes linear again."
    jump nested_if_exit

label nested_if_exit:
    r "RenPy Mouse escapes with a smaller canvas."
    return
