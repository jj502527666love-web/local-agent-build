import glob
patterns = [r'F:\\**\\design_spec_reference.md', r'F:\\**\\spec_lock_reference.md', r'F:\\**\\project_manager.py', r'F:\\**\\svg_to_pptx.py']
for p in patterns:
    print('PATTERN', p)
    ms = glob.glob(p, recursive=True)
    for m in ms[:50]:
        print(m)
