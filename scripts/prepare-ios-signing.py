"""Seed signing keys before Tauri 2.11.4 mutates the generated Xcode project.

Tauri issue #14462: insertion can place new keys outside buildSettings.
Updating existing keys works. Keep real identities in encrypted CI inputs.
Remove this workaround after upgrading to a verified upstream fix.
"""

import re
import sys
from pathlib import Path


SIGNING_KEYS = (
    "CODE_SIGN_STYLE",
    "DEVELOPMENT_TEAM",
    "CODE_SIGN_IDENTITY",
    '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"',
    '"DEVELOPMENT_TEAM[sdk=iphoneos*]"',
    "PROVISIONING_PROFILE_SPECIFIER",
    '"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]"',
)


def prepare(path: Path) -> None:
    lines = path.read_text().splitlines(keepends=True)
    result = []
    in_section = False
    indent = None
    present = set()
    count = 0
    for line in lines:
        if line.strip() == "/* Begin XCBuildConfiguration section */":
            in_section = True
        elif line.strip() == "/* End XCBuildConfiguration section */":
            in_section = False
        if in_section and (match := re.fullmatch(r"(\s*)buildSettings = \{\n", line)):
            if indent is not None:
                raise ValueError("Unexpected nested Xcode build settings")
            indent = match[1]
            present = set()
        elif indent is not None:
            if line == indent + "};\n":
                for key in SIGNING_KEYS:
                    if key not in present:
                        result.append(f'{indent}\t{key} = "";\n')
                indent = None
                count += 1
            elif " = " in line:
                present.add(line.strip().split(" = ", 1)[0])
        result.append(line)
    if indent is not None or count == 0:
        raise ValueError("Expected complete generated Xcode build settings")
    path.write_text("".join(result))
    print(f"Prepared signing keys in {count} Xcode build configurations")


if __name__ == "__main__":
    prepare(Path(sys.argv[1]))
