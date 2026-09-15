# Clockwork Library demo: a quiet night spent polishing one scene.

default scene_tone = "warm"
default next_stop = "ending_quiet"

label start:
    scene library night with fade
    play music library_loop fadein 1.0
    show renpy bright at left with dissolve

    # The demo opens slowly on purpose: this is a scene, not a route directory.
    r "RenPy Mouse wakes on a catalog card stamped with tomorrow's date."
    r "Above him, the Clockwork Library is trying to open every chapter at once."
    r "No, he tells the shelves. Tonight we finish one good scene."
    r "A brass bookmark stops mid-sprint and pretends it was only stretching."
    r "The moon waits in the window while the dust settles into patient silver."
    r "Somewhere below, a clock clears its throat and chooses not to interrupt."
    r "RenPy Mouse straightens his tiny waistcoat and opens the editor's green door."
    r "The library dims every unnecessary arrow until only the next conversation glows."

    call library_hall

    show renpy thinking at center with dissolve
    play sound page_turn

    r "When RenPy Mouse returns, the same room feels deeper without becoming larger."
    r "The shelves have learned that a pause can carry more story than another detour."
    r "He rereads the scene aloud, listening for the place where the silence answers."
    r "A comma rolls off the desk; he catches it before it can become a subplot."
    r "The library laughs softly enough not to shake the dialogue out of order."
    r "Together they carry the finished page upstairs for one last look at the moon."

    $ next_stop = "ending_bright" if scene_tone != "quiet" else "ending_quiet"
    jump rooftop_signal
