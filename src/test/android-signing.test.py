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
VERIFY_STEP = WORKFLOW.split('      - name: Confirm the APK is not debuggable\n', 1)[1].split('      - name: Upload the APK\n', 1)[0]
VERIFY_SCRIPT = '\n'.join(line[10:] for line in VERIFY_STEP.split('        run: |\n', 1)[1].splitlines())


class AndroidSigningTests(unittest.TestCase):
    def run_signing(self, values, certificate_valid=True, build_time=1795504500):
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
            clock = binary / 'date'
            clock.write_text('#!/bin/bash\nprintf "%s\\n" ' + str(build_time) + '\n')
            clock.chmod(0o700)
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

    def test_later_build_has_higher_version_even_with_same_workflow_run_number(self):
        values = {'KEYSTORE_B64': base64.b64encode(b'test').decode(),
                  'KS_PASS': 'test', 'KEY_ALIAS': 'test'}
        first, _, first_gradle = self.run_signing(values, build_time=1795504500)
        later, _, later_gradle = self.run_signing(values, build_time=1795504501)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(later.returncode, 0, later.stderr)
        self.assertIn('versionCode 217667700', first_gradle)
        self.assertIn('versionCode 217667701', later_gradle)

    def run_verification(self, package='com.crosiangames.president', version='217667700', fingerprint='A' * 64,
                         indent='', expected='A' * 64, debuggable=False, signer_valid=True):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            apk = directory / 'android/app/build/outputs/apk/release/app-release.apk'
            apk.parent.mkdir(parents=True)
            apk.write_bytes(b'synthetic apk')
            (directory / 'capacitor.config.json').write_text('{"appId":"com.crosiangames.president"}')
            (directory / 'expected-signature.txt').write_text(expected + '\n')
            (directory / 'expected-version.txt').write_text('217667700\n')
            tools = directory / 'build-tools/36.0.0'
            tools.mkdir(parents=True)
            for name, output in [('aapt', "package: name='" + package + "' versionCode='" + version + "'" + ('\napplication-debuggable' if debuggable else '')),
                                 ('apksigner', indent + 'Signer #1 certificate SHA-256 digest: ' + fingerprint)]:
                executable = tools / name
                executable.write_text('#!/bin/bash\ncat <<\'OUTPUT\'\n' + output + '\nOUTPUT\n' + ('exit 1\n' if name == 'apksigner' and not signer_valid else ''))
                executable.chmod(0o700)
            result = subprocess.run(['bash', '-c', VERIFY_SCRIPT], cwd=temp,
                                    env={**os.environ, 'RUNNER_TEMP': temp, 'ANDROID_HOME': temp},
                                    capture_output=True, text=True)
            return result.returncode, (directory / 'president-rise-to-power.apk').exists()

    def test_matching_identity_can_be_downloaded(self):
        self.assertEqual(self.run_verification(), (0, True))

    def test_indented_digest_with_crlf_can_be_downloaded(self):
        self.assertEqual(self.run_verification(indent='  ', fingerprint='a' * 64 + '\r'), (0, True))

    def test_colon_separated_digests_can_be_downloaded(self):
        self.assertEqual(self.run_verification(fingerprint=':'.join(['aa'] * 32), expected=':'.join(['AA'] * 32)), (0, True))

    def test_empty_or_malformed_fingerprint_is_not_uploaded(self):
        for fingerprint in ['', 'A' * 63, 'G' * 64]:
            with self.subTest(fingerprint=fingerprint):
                code, uploaded = self.run_verification(fingerprint=fingerprint)
                self.assertNotEqual(code, 0)
                self.assertFalse(uploaded)

    def test_debuggable_apk_is_not_uploaded(self):
        code, uploaded = self.run_verification(debuggable=True)
        self.assertNotEqual(code, 0)
        self.assertFalse(uploaded)

    def test_invalid_apk_signature_is_not_uploaded(self):
        code, uploaded = self.run_verification(signer_valid=False)
        self.assertNotEqual(code, 0)
        self.assertFalse(uploaded)

    def test_wrong_signer_is_not_uploaded(self):
        code, uploaded = self.run_verification(fingerprint='B' * 64)
        self.assertNotEqual(code, 0)
        self.assertFalse(uploaded)

    def test_wrong_package_is_not_uploaded(self):
        code, uploaded = self.run_verification(package='another.game')
        self.assertNotEqual(code, 0)
        self.assertFalse(uploaded)

    def test_wrong_version_is_not_uploaded(self):
        code, uploaded = self.run_verification(version='1')
        self.assertNotEqual(code, 0)
        self.assertFalse(uploaded)


if __name__ == '__main__':
    unittest.main()