"""Seed signing keys before Tauri 2.11.4 mutates the generated Xcode project.

Tauri issue #14462: insertion can place new keys outside buildSettings.
Updating existing keys works. Keep real identities in encrypted CI inputs.
Remove this workaround after upgrading to a verified upstream fix.
"""

import base64
import hashlib
import os
import plistlib
import re
import subprocess
import sys
import tempfile
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


def signing_settings() -> dict[str, str]:
    team = os.environ.get("TAURI_APPLE_DEVELOPMENT_TEAM", "")
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        raise ValueError("Expected encrypted Apple development team input")
    profile_bytes = base64.b64decode(os.environ["IOS_MOBILE_PROVISION"], validate=True)
    with tempfile.NamedTemporaryFile(suffix=".mobileprovision") as profile_file:
        profile_file.write(profile_bytes)
        profile_file.flush()
        decoded = subprocess.run(
            ["security", "cms", "-D", "-i", profile_file.name],
            capture_output=True,
            check=True,
        )
    profile = plistlib.loads(decoded.stdout)
    if profile.get("TeamIdentifier") != [team]:
        raise ValueError("Provisioning profile must match the encrypted team")
    certificates = profile.get("DeveloperCertificates", [])
    if len(certificates) != 1:
        raise ValueError("Expected the dedicated single-certificate review profile")
    # Xcode accepts a certificate SHA-1 fingerprint as its signing selector.
    certificate = hashlib.sha1(certificates[0]).hexdigest().upper()
    profile_id = profile["UUID"]
    if not re.fullmatch(r"[A-Fa-f0-9-]{36}", profile_id):
        raise ValueError("Expected a provisioning profile UUID")
    return dict(zip(SIGNING_KEYS, (
        "Manual", team, certificate, certificate, team, profile_id, profile_id,
    )))


def prepare(path: Path, settings: dict[str, str]) -> None:
    # Tauri reads export values from its pre-update parse, so these must be real
    # values already. CODE_SIGN_STYLE must be unquoted for its plist conversion.
    def assignment(key: str) -> str:
        value = settings[key] if key == "CODE_SIGN_STYLE" else f'"{settings[key]}"'
        return f'{indent}\t{key} = {value};\n'

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
                        result.append(assignment(key))
                indent = None
                count += 1
            elif " = " in line:
                key = line.strip().split(" = ", 1)[0]
                present.add(key)
                if key in settings:
                    line = assignment(key)
        result.append(line)
    if indent is not None or count == 0:
        raise ValueError("Expected complete generated Xcode build settings")
    path.write_text("".join(result))
    print(f"Prepared signing keys in {count} Xcode build configurations")


if __name__ == "__main__":
    prepare(Path(sys.argv[1]), signing_settings())
