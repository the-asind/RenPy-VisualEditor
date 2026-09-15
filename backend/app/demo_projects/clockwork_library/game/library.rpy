# The main Action Editor showcase: one long scene, one menu, and one condition.

label library_hall:
    scene library night with dissolve
    show renpy thinking at right
    play sound page_turn

    # RenPy Mouse and the library edit the emotional rhythm of a single page.
    r "The main hall has pushed every table aside to make room for one enormous page."
    r "Its first sentence is wearing three adjectives and asking whether the fourth is flattering."
    r "RenPy Mouse removes two; the sentence immediately stands straighter."
    r "The library objects that the missing words had excellent references."
    r "References are not alibis, says the mouse, tapping the margin with his pencil."
    r "A chandelier lowers itself until its warm gears become a pool of amber light."
    r "Outside, rain writes a second draft against the tall blue windows."
    r "Inside, the page waits with the nervous dignity of an actor before opening night."
    r "RenPy Mouse reads the dialogue once for meaning and once for breath."
    r "On the third reading, even the clock forgets to tick between the lines."

    menu:
        r "What should the scene remember most clearly?"

        "The warmth of the reading lamp":
            $ scene_tone = "warm"
            show renpy bright at center with dissolve
            r "RenPy Mouse turns the lamp until the page glows like fresh bread."
            r "The heroine's brave line stops sounding rehearsed and starts sounding true."
            r "A shy footnote comes closer to the light, carrying a joke it nearly deleted."
            r "They keep the joke; courage, the mouse decides, should be allowed to smile."

        "The hush between two sentences":
            $ scene_tone = "quiet"
            show renpy thinking at center with dissolve
            r "RenPy Mouse leaves a clean breath between the question and its answer."
            r "The empty space is not empty; rain, gears, and worry all fit inside it."
            r "The library leans in and discovers that silence has excellent handwriting."
            r "Nothing moves for one perfect beat, except a comma settling into place."

        "The mischief hiding under the ink":
            $ scene_tone = "playful"
            show renpy bright at left with dissolve
            play sound gear_click
            r "RenPy Mouse gives the sternest sentence a tiny squeak at the end."
            r "The library tries not to laugh and accidentally illuminates every window."
            r "A metaphor escapes from the wastebasket wearing somebody else's hat."
            r "They let it stay, provided it promises not to demand its own label."

    show renpy thinking at right with dissolve
    play sound page_turn

    r "With the tone chosen, RenPy Mouse places the dialogue back into the scene."
    r "Each line now has something to do besides point toward the next line."
    r "The page remembers the rain, the lamp, and the exact weight of an unfinished answer."
    r "The library reads it again and does not once ask where the next branch begins."
    r "That restraint is so impressive that the clock awards itself a quiet chime."
    r "RenPy Mouse writes one final note in the margin: let the feeling arrive before the plot."

    if scene_tone == "warm":
        show renpy bright at center
        r "In the warm version, the farewell sounds less like an ending than an invitation."
        r "The lamp makes a small sunrise on the edge of the desk."
        r "The library keeps one chair pulled out for whoever reads the scene next."
        r "RenPy Mouse underlines the last kind word and leaves the pencil there."
    elif scene_tone == "playful":
        show renpy bright at left
        r "In the playful version, the farewell bows and then steals its own hat."
        r "A row of dictionaries applauds with very serious covers."
        r "RenPy Mouse adds one restrained squeak, then removes two extravagant ones."
        r "The library calls this compromise and quietly saves both drafts."
    else:
        show renpy thinking at center
        r "In the quiet version, the farewell is only a hand resting beside another hand."
        r "The rain finishes the sentence on the glass without using any words."
        r "RenPy Mouse waits until the clock resumes before he touches the page."
        r "The library closes no book; it simply lets the moment become complete."

    show renpy bright at right with dissolve

    r "The enormous page folds itself down to mouse size and lands neatly in his paws."
    r "It contains fewer routes than before and far more places to linger."
    r "The library admits that this is inconveniently beautiful."
    r "RenPy Mouse accepts the compliment on behalf of every carefully edited pause."
    r "They seal the draft with a brass gear no larger than a button."
    r "Upstairs, the rooftop telescope turns toward the brightest line in the scene."

    return

label .secret_shelf:
    show renpy bright at center
    play sound page_turn

    # A nested-label vignette remains visible without adding another transition.
    r "Behind the nearest shelf waits a room small enough to be a secret and bright enough to edit in."
    r "RenPy Mouse finds rejected lines sleeping there under a blanket of paper scraps."
    r "None of them are bad; they simply belong to stories that have not arrived yet."
    r "He labels a drawer for excellent sentences with nowhere urgent to go."
    r "The library pretends this is ordinary catalog work and brings him a tiny cup of tea."
    r "Together they rescue one description of moonlight and return the rest to their dreams."
    r "A local label hangs above the door, useful, precise, and entirely content to stay put."
    r "RenPy Mouse closes the drawer without turning the moment into another route."

    return
