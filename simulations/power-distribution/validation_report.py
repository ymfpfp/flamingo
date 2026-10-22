"""Read a matching consolidated validation report for a rendered review."""
import hashlib
import json
from check_layout import ROOT


def validation_report(file, scope):
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    for name in [scope, 'board']:
        path = ROOT / f'dist/validation/{name}.json'
        if path.exists():
            report = json.loads(path.read_text())
            if report.get('sourceSha256') == digest and report.get('passed'):
                return report['reports']
    raise ValueError(f'Run check:{scope} or check:board on this build before rendering its review')
