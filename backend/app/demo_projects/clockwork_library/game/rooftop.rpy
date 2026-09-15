# The single bridge from the edited scene to a dynamically chosen ending.

label rooftop_signal:
    scene rooftop signal with fade
    show renpy bright at right
    play music library_loop fadein 0.5

    r "On the roof, the moon looks less like a minimap and more like a patient reader."
    r "RenPy Mouse lays the finished page beneath the telescope's round glass eye."
    r "The brass tube reads slowly, magnifying every pause until it becomes a small room."
    r "It approves of the rain, questions one adjective, and adores the escaped metaphor."
    r "The library waits below with all its windows open to the same page."
    r "RenPy Mouse changes the adjective and refuses to apologize to it."
    r "A breeze turns the paper over, revealing a final line written in moonlight."
    r "The line does not name its ending; it only points toward the feeling that earned it."
    r "That is enough for the story and, after a thoughtful squeak, enough for the mouse."
    r "He lets the chosen tone decide which quiet door should open next."

    jump expression next_stop
