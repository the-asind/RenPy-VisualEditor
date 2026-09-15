"""Collect license/notice files from the installed Python distributions.

Run inside the backend image so the manifest matches shipped dependencies.
Base image operating-system notices remain under /usr/share/doc.
"""
import argparse
import importlib.metadata
from pathlib import Path


def build(output: Path) -> int:
    sections = ['Python dependency notices\nGenerated from installed distributions.\n'
                'Original license terms apply to each dependency.\n']
    count = 0
    for dist in sorted(importlib.metadata.distributions(), key=lambda d: d.metadata['Name'].lower()):
        files = [f for f in dist.files or () if any(
            key in Path(str(f)).name.lower() for key in ('license', 'copying', 'notice'))]
        texts = []
        for file in sorted(files, key=str):
            path = Path(dist.locate_file(file))
            if path.is_file():
                texts.append(f'--- {file} ---\n{path.read_text(encoding="utf-8", errors="replace")}')
        if not texts:
            raise RuntimeError(f'Missing license texts: {dist.metadata["Name"]} {dist.version}')
        terms = dist.metadata.get('License-Expression') or dist.metadata.get('License') or 'See bundled license text'
        sections.append(f'\n{"=" * 72}\n{dist.metadata["Name"]} {dist.version}\n{terms}\n' + '\n'.join(texts))
        count += 1
    output.write_text('\n'.join(sections), encoding='utf-8')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('THIRD_PARTY_NOTICES.txt'))
    args = parser.parse_args()
    print(f'Generated Python notices for {build(args.output)} distributions')
