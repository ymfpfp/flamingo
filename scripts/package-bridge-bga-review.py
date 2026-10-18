"""Prepare review-only geometry files; never submit an order or contact a vendor."""
from pathlib import Path
import csv
import hashlib
import io
import json
import zipfile

root = Path(__file__).resolve().parents[1]
folder = root / 'manufacturing/bridge-bga'
review = folder / 'review'
circuit = json.loads((review / 'footprint.circuit.json').read_text())
rows = []
for p in circuit:
    if p['type'] != 'pcb_smtpad':
        continue
    circle = p['shape'] == 'circle'
    width = 2 * p['radius'] if circle else p['width']
    height = 2 * p['radius'] if circle else p['height']
    margin = p['soldermask_margin']
    rows.append([p['port_hints'][1], p['x'], p['y'], p['shape'], width, height,
                 width + 2 * margin, height + 2 * margin, width, height])
assert len(rows) == 273
buf = io.StringIO()
writer = csv.writer(buf)
writer.writerow(['ball', 'top_view_x_mm', 'top_view_y_mm', 'shape', 'copper_width_mm', 'copper_height_mm',
                 'mask_width_mm', 'mask_height_mm', 'paste_width_mm', 'paste_height_mm'])
writer.writerows(rows)
(review / 'ball-geometry.csv').write_text(buf.getvalue())

# Remove dummy BOM/PnP files. The isolated coupon has no verified assembly rotation.
gerber_path = review / 'gerbers.zip'
with zipfile.ZipFile(gerber_path) as archive:
    gerbers = {name: archive.read(name) for name in archive.namelist() if name.endswith('.gbr')}
assert len(gerbers) == 14
# Check the exported dimensions, not just the source footprint.
assert b'%ADD10C,0.200000*%' in gerbers['F_Cu.gbr']
assert b'C,0.250000*%' in gerbers['F_Mask.gbr']
assert b'C,0.197800*%' in gerbers['F_Mask.gbr']
assert b'VERTPILL,0.177800X0.330200X0.177800X0.076200*%' in gerbers['F_Paste.gbr']
assert b'HORZPILL,0.330200X0.177800X0.177800X0.076200*%' in gerbers['F_Paste.gbr']
assert b'C,0.200000*%' in gerbers['F_Paste.gbr']
with zipfile.ZipFile(gerber_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in gerbers.items():
        archive.writestr(name, data)

attachments = ['README.md', 'DFM-request.md', 'process.json', 'review/geometry.json', 'review/footprint.svg',
               'review/ball-geometry.csv', 'review/gerbers.zip']
manifest = {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in attachments}
record = {'prepared_on': '2026-10-17', 'status': 'not_sent_pending_user_authorization',
          'purpose': 'Pre-layout DFM/DFA review only. No fabrication or procurement authorization.',
          'file_sha256': manifest}
(review / 'package-manifest.json').write_text(json.dumps(record, indent=2) + '\n')
with zipfile.ZipFile(review / 'vendor-review.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in attachments:
        archive.write(folder / name, name)
    archive.write(review / 'package-manifest.json', 'review/package-manifest.json')
print('Review package prepared; 273 ball records and exported copper/mask/paste dimensions checked.')
