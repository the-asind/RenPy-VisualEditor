# Mouse RenPy diagnostics: intentionally awkward cases for warnings.
label duplicate_cheese:
    r "First cheese label."
    jump missing_cheese_label

label duplicate_cheese:
    r "Second cheese label with the same global name."
    $ suspicious_target = "day_two"
    jump expression suspicious_target

label unsafe_parent:
    r "This block is here to test raw fallback boundaries."
    while crumb_count < 3:
        $ crumb_count += 1
        r "Loop crumbs are preserved as a raw block for MVP."