"""Stackup sensitivity of all 12 fresh channels in the existing passive model.

This reuses the validated model definitions and vendor component models. It
replaces every stack-dependent input and all board geometry with this review's
explicit inputs. Lumped launches and the homogeneous via proxy remain models,
not 3D extraction. Copper and fabrication files are not changed.
"""
import hashlib
import itertools
import json
from pathlib import Path
import sys

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist/stackup-half-ounce-review-2026-10-26'
sys.path.insert(0, str(ROOT/'simulations/channel-si'))
from focused_loss_loading import load_model, evaluate


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    m, _ = load_model()
    gfile = OUT/'signal-inputs/geometry.json'
    g = json.loads(gfile.read_text())
    source = ROOT/g['sourceFile']
    assert sha(source) == g['sourceSha256']
    sections = json.loads((OUT/'signal.json').read_text())
    assert sections['sourceSha256'] == g['sourceSha256']
    m['g'] = g
    m['planes'] = {layer: unary_union([
        Polygon([(v['x'], v['y']) for v in p['brep_shape']['outer_ring']['vertices']],
                [[(v['x'], v['y']) for v in ring['vertices']] for ring in p['brep_shape'].get('inner_rings', [])])
        for p in g['groundPlanes'] if p['layer'] == layer]) for layer in ['inner1', 'inner4']}
    checks = list(m['checks'])
    results, maximum_passivity, maximum_reciprocity = [], 0., 0.
    for path, section in zip([
        ROOT/'manufacturing/stackup/selected.json',
        ROOT/'manufacturing/stackup/JLC06161H-3313.json',
    ], sections['cases']):
        stack = json.loads(path.read_text())
        assert stack['code'] == section['code']
        assert sha(path) == sections['inputSha256'][str(path.relative_to(ROOT))]
        m['stack'] = stack
        m['h'] = stack['dielectrics'][0]['thicknessMm']
        m['er'] = stack['dielectrics'][0]['designDk']
        normal = section['lines']['normal']['results'][-1]
        isolated = section['lines']['neckIsolated']['results'][-1]
        coupled = section['lines']['neckCoupled']['results'][-1]
        m['normal_z'], m['normal_er'] = normal['impedance_ohm'], normal['effective_er']
        m['neck_cases'] = {
            'isolated_3mil_line': (isolated['impedance_ohm']*2, isolated['effective_er']),
            'coupled_3mil_line': (coupled['impedance_ohm'], coupled['effective_er']),
        }
        m['via_delay'] = sum(d['thicknessMm']/1000*np.sqrt(d['designDk'])/m['C0'] for d in stack['dielectrics'])
        rows = []
        for channel in g['channels']:
            via_rows = []
            pv, nv = [[v for s in c['stages'] for v in s['vias']] for c in channel['conductors']]
            assert len(pv) == len(nv)
            for a, b in zip(pv, nv):
                pitch = np.hypot(a['x']-b['x'], a['y']-b['y'])
                diam = (a['hole_diameter']+b['hole_diameter'])/2+.04
                via_rows.append({'twoWireHomogeneousProxyZdiffOhm': float(120/np.sqrt(4.5)*np.arccosh(pitch/diam))})
            geometry = {'viaProxies': via_rows}
            scenarios = []
            for df, roughness, via_scale in itertools.product([.012, .02, .03], [1., 1.5, 2.], [.8, 1., 1.2]):
                value, scattering = evaluate(m, channel, geometry, df=df, roughness=roughness, viaScale=via_scale)
                maximum_passivity = max(maximum_passivity, float(np.linalg.svd(scattering, compute_uv=False).max()))
                maximum_reciprocity = max(maximum_reciprocity, float(np.max(abs(scattering[:,0,1]-scattering[:,1,0]))))
                scenarios.append(dict(df=df, roughness=roughness, viaScale=via_scale, **value))
            # Exact lossless matched-line analytic control after each context update.
            test = m['s_matrix'](m['line'](42.5, 100e-12))
            assert np.max(abs(test[:,0,0])) < 1e-12
            rows.append(dict(name=channel['name'], nyquistGHz=channel['nyquistGHz'], scenarios=scenarios,
                             insertionLossRangeDB=[min(r['insertionLossDB'] for r in scenarios), max(r['insertionLossDB'] for r in scenarios)],
                             returnLossRangeDB=[min(r['returnLossDB'] for r in scenarios), max(r['returnLossDB'] for r in scenarios)]))
        results.append(dict(code=stack['code'], channels=rows, viaDelayProxyPS=m['via_delay']*1e12))
        print(stack['code'], '12 channels, 324 scenarios', flush=True)
    checks.append(dict(name='All updated-channel passive scattering matrices', passed=maximum_passivity <= 1.00001,
                       maximumSingularValue=maximum_passivity))
    checks.append(dict(name='All updated-channel reciprocal scattering matrices', passed=maximum_reciprocity < 1e-8,
                       maximumComplexDifference=maximum_reciprocity))
    assert all(c['passed'] for c in checks)
    result = dict(sourceSha256=g['sourceSha256'], cases=results, numericalChecks=checks,
                  scope='Same fresh geometry and component models under two explicit stackups; 27 sensitivity cases per channel at 1601 frequencies from 0.05 to 16 GHz.',
                  limitations=[
                      'Df 0.012/0.02/0.03 and roughness multipliers 1/1.5/2 are assumed sensitivity cases, not verified properties or statistical bounds.',
                      'The via model uses an unshielded two-wire 4.5 dielectric proxy, with 0.8/1/1.2 impedance multipliers and 0.08 pF lumped loading. Actual multilayer via fields are not extracted.',
                      'Pad capacitance uses a parallel-plate overlap proxy with the updated reference height; finite fringing is omitted.',
                      'Inner power-plane changes near launches, adjacent-pair coupling, dispersion and manufacturing variation are not extracted.',
                      'Same top trace copper and surface loss assumptions in both cases. Inner-plane DC resistance does not directly multiply this high-frequency line-loss proxy.',
                      'Model passivity and reciprocity are numerical controls. They do not demonstrate a working link, eye diagram or BER compliance.',
                      'Package/PHY and connector models are unavailable; RX capacitor and extrapolated high-frequency component properties retain prior model limitations.',
                  ],
                  inputSha256={str(p.relative_to(ROOT)): sha(p) for p in [
                      Path(__file__), gfile, OUT/'signal.json',
                      ROOT/'simulations/channel-si/focused_loss_loading.py',
                      ROOT/'dist/si-channel-review/fast-screening/component_tline.py',
                  ]})
    (OUT/'channels.json').write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
