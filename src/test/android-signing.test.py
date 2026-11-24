"""Signing guard regressions; run with python3 src/test/android-signing.test.py."""
import base64
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / '.github/workflows/android-apk.yml').read_text()
STEP = WORKFLOW.split('      - name: Set up the signing key, version and anti-tamper fingerprint\n', 1)[1].split('      - name: Build the release APK\n', 1)[0]
SCRIPT = '\n'.join(line[10:] for line in STEP.split('        run: |\n', 1)[1].splitlines())
SCRIPT = SCRIPT.replace('${{ github.run_number }}', '200')


class AndroidSigningTests(unittest.TestCase):
    def run_signing(self, values, certificate_valid=True):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            java = directory / 'android/app/src/main/java/com/crosiangames/president'
            java.mkdir(parents=True)
            (java / 'MainActivity.java').write_text('__EXPECTED_SIGNATURE__')
            (directory / 'android/app/build.gradle').write_text('versionCode 1\nversionName "1.0"\n')
            binary = directory / 'bin'
            binary.mkdir()
            keytool = binary / 'keytool'
            keytool.write_text('#!/bin/bash\n' + (
                'printf "synthetic certificate" > "$RUNNER_TEMP/signing-cert.der"\n'
                if certificate_valid else 'exit 1\n'))
            keytool.chmod(0o700)
            env = {**os.environ, 'RUNNER_TEMP': temp, 'PATH': str(binary) + ':' + os.environ['PATH'],
                   'KEYSTORE_B64': '', 'KS_PASS': '', 'KEY_ALIAS': '', 'KEY_PASS': '', **values}
            result = subprocess.run(['bash', '-c', SCRIPT], cwd=temp, env=env,
                                    capture_output=True, text=True)
            return result, (directory / 'release.keystore').exists(), (directory / 'android/app/build.gradle').read_text()

    def test_missing_credentials_cannot_generate_replacement_key(self):
        result, key_exists, _ = self.run_signing({})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(key_exists)
        self.assertIn('Missing signing credential', result.stdout)

    def test_invalid_base64_stops_before_signing(self):
        result, _, _ = self.run_signing({'KEYSTORE_B64': '%%%%', 'KS_PASS': 'test', 'KEY_ALIAS': 'test'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Invalid ANDROID_KEYSTORE_BASE64', result.stdout)

    def test_wrong_certificate_credentials_stop_build(self):
        result, _, _ = self.run_signing({'KEYSTORE_B64': base64.b64encode(b'test').decode(),
                                       'KS_PASS': 'test', 'KEY_ALIAS': 'test'}, False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Cannot unlock signing certificate', result.stdout)

    def test_passwords_with_quotes_are_not_written_to_gradle(self):
        password = "synthetic'password$with\\characters"
        result, _, gradle = self.run_signing({'KEYSTORE_B64': base64.b64encode(b'test').decode(),
                                            'KS_PASS': password, 'KEY_ALIAS': 'test'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(password, gradle)
        self.assertIn("System.getenv('KS_PASS')", gradle)


if __name__ == '__main__':
    unittest.main()