"""Coupled-trunk quasi-TEM stress screen. Excludes launches and vias.

Solve the full four-conductor electrostatic Dirichlet problem in dielectric and
vacuum. Energy bilinear forms give C and C0, and L = inv(C0) / c**2. Propagate
the lossless multiconductor line with the matrix telegrapher equations. This is
an independent screening model, not a USB4/PCIe compliance or 3D extraction.
"""
from pathlib import Path
import hashlib
import json
import math
import sys
import time
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import splu
from scipy.linalg import expm

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'simulations/pcie-tx'))
from cross_section import axis, EPS0, C0

OUT = ROOT / 'dist/si-channel-review/focused-risks'
INPUT = ROOT / 'dist/si-channel-review/selected-stackup-inputs'
H = .092
W = .1234
G = .1001
T = .04064
TAPER = .01778


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def capacitance(step, separation, vacuum=False, exterior=1.2, pair_count=2, er=4.1):
    span = 2 * W + G
    centers = [0.] if pair_count == 1 else [-(span + separation) / 2, (span + separation) / 2]
    traces = [(c - span / 2, c - span / 2 + W) for c in centers]
    traces = [v for c in centers for v in [(c - span / 2, c - G / 2), (c + G / 2, c + span / 2)]]
    right = max(v[1] for v in traces)
    # Symmetric grid; explicit features retain all conductor edges and taper.
    xf = [abs(v) for t in traces for v in (t[0], t[1], t[0] + TAPER / 2, t[1] - TAPER / 2)]
    xp = axis(xf, right + .12, right + exterior, step)
    x = np.r_[-xp[:0:-1], xp]
    y = axis([H, H + T, H + .03048, H + T + .01524], H + T + .10, H + exterior, step)
    xx, yy = np.meshgrid(x, y)
    electrode = np.full(xx.shape, -1, int)
    taper = np.clip((yy - H) / T, 0, 1) * TAPER / 2
    for k, (lo, hi) in enumerate(traces):
        m = (yy >= H - 1e-10) & (yy <= H + T + 1e-10) & (xx >= lo + taper - 1e-10) & (xx <= hi - taper + 1e-10)
        electrode[m] = k

    def dielectric(xv, yv):
        shape = np.broadcast_shapes(xv.shape, yv.shape)
        if vacuum:
            return np.ones(shape)
        e = np.where(yv <= H, er, 1.) + np.zeros_like(xv)
        over_trace = np.zeros(shape, bool)
        for lo, hi in traces:
            over_trace |= (xv >= lo) & (xv <= hi)
        mask_top = np.where(over_trace, T + .01524, .03048)
        return np.where((yv > H) & (yv <= H + mask_top), 3.8, e)

    hx = np.diff(x)
    hy = np.diff(y)
    dx = np.r_[hx[0] / 2, (hx[:-1] + hx[1:]) / 2, hx[-1] / 2]
    dy = np.r_[hy[0] / 2, (hy[:-1] + hy[1:]) / 2, hy[-1] / 2]
    xm, ym = (x[:-1] + x[1:]) / 2, (y[:-1] + y[1:]) / 2
    ex = (dielectric(xm[None, :], (y - dy / 4)[:, None]) + dielectric(xm[None, :], (y + dy / 4)[:, None])) / 2
    ey = (dielectric((x - dx / 4)[None, :], ym[:, None]) + dielectric((x + dx / 4)[None, :], ym[:, None])) / 2
    gx, gy = ex * dy[:, None] / hx[None, :], ey * dx[None, :] / hy[:, None]
    ids = np.arange(xx.size).reshape(xx.shape)
    ia = np.r_[ids[:, :-1].ravel(), ids[:-1, :].ravel()]
    ib = np.r_[ids[:, 1:].ravel(), ids[1:, :].ravel()]
    conductance = np.r_[gx.ravel(), gy.ravel()]
    fixed = electrode >= 0
    fixed[0, :] = fixed[-1, :] = fixed[:, 0] = fixed[:, -1] = True
    free = np.flatnonzero(~fixed.ravel())
    index = np.full(xx.size, -1)
    index[free] = np.arange(len(free))
    aa, bb = index[ia], index[ib]
    diag = np.bincount(np.r_[ia, ib], weights=np.r_[conductance, conductance], minlength=xx.size)[free]
    both = (aa >= 0) & (bb >= 0)
    mat = coo_matrix((np.r_[diag, -conductance[both], -conductance[both]], (np.r_[np.arange(len(free)), aa[both], bb[both]], np.r_[np.arange(len(free)), bb[both], aa[both]])), shape=(len(free), len(free))).tocsc()
    v = np.zeros((xx.size, len(traces)))
    for k in range(len(traces)):
        v[electrode.ravel() == k, k] = 1.
    rhs = np.zeros((len(free), len(traces)))
    for k in range(len(traces)):
        a = (aa >= 0) & (bb < 0)
        np.add.at(rhs[:, k], aa[a], conductance[a] * v[ib[a], k])
        b = (bb >= 0) & (aa < 0)
        np.add.at(rhs[:, k], bb[b], conductance[b] * v[ia[b], k])
    v[free] = splu(mat).solve(rhs)
    residual = float(np.max(abs(mat @ v[free] - rhs)) / np.max(abs(rhs)))
    dv = v[ia] - v[ib]
    cap = EPS0 * (dv.T @ (conductance[:, None] * dv))
    return cap, {'nodes': xx.size, 'relativeResidual': residual, 'minimumCapacitanceEigenvalue': float(np.min(np.linalg.eigvalsh(cap)))}


def scatter(cap, ind, length, frequency, z=42.5):
    n = len(cap)
    m = expm(2j * np.pi * frequency * np.block([[np.zeros((n, n)), ind], [cap, np.zeros((n, n))]]) * length)
    a, b, c, d = m[:n, :n], m[:n, n:], m[n:, :n], m[n:, n:]
    eye = np.eye(n)
    lhs = np.block([[eye, -(a + b / z)], [-eye, -(z * c + d)]])
    rhs = np.block([[-eye, a - b / z], [-eye, z * c - d]])
    return np.linalg.solve(lhs, rhs)


def model(step, separation, exterior=1.2, pair_count=2):
    c, a = capacitance(step, separation, exterior=exterior, pair_count=pair_count)
    c0, b = capacitance(step, separation, vacuum=True, exterior=exterior, pair_count=pair_count)
    l = np.linalg.inv(c0) / C0**2
    return c, c0, l, {'stepMm': step, 'foreignEdgeSeparationMm': separation, 'exteriorMm': exterior, 'dielectricSolve': a, 'vacuumSolve': b}


def mixed_transform():
    t = np.zeros((8, 8))
    for end in range(2):
        for pair in range(2):
            k = end * 4 + pair * 2
            t[k, k] = t[k + 1, k] = t[k + 1, k + 1] = 1 / math.sqrt(2)
            t[k, k + 1] = -1 / math.sqrt(2)
    return t


def main():
    start = time.monotonic()
    OUT.mkdir(parents=True, exist_ok=True)
    handoff = json.loads((INPUT / 'field-solver-handoff.json').read_text())
    stack = json.loads((INPUT / 'selected.json').read_text())
    assert digest(INPUT / 'selected.json') == digest(ROOT / 'manufacturing/stackup/selected.json')
    assert handoff['sourceSha256'] == digest(INPUT / 'board.circuit.json')
    assert stack['dielectrics'][0]['thicknessMm'] == H
    controls = []
    c, c0, l, check = model(.002, .736, pair_count=1)
    odd = np.array([1., -1.]) / math.sqrt(2)
    z = 2 * math.sqrt(float(odd @ l @ odd) / float(odd @ c @ odd))
    controls.append({'name': 'Independent full-domain pair matches saved nominal selected-height result', 'differentialOhms': z, 'referenceOhms': 85.10195492734279, 'relativeDifference': abs(z / 85.10195492734279 - 1), 'passed': abs(z / 85.10195492734279 - 1) < .01})
    frequencies = np.linspace(.1, 16, 160) * 1e9
    transform = mixed_transform()
    uc = np.eye(4) * 1e-10
    ul = np.eye(4) * 2.5e-7
    us = scatter(uc, ul, .025, 10e9, z=50.)
    analytic = np.zeros((8, 8), complex)
    for k in range(4):
        analytic[k, k + 4] = analytic[k + 4, k] = np.exp(-2j * np.pi * 10e9 * math.sqrt(1e-10 * 2.5e-7) * .025)
    controls.append({'name': 'Independent uncoupled matched-line phase, port signs and zero cross-coupling', 'maximumComplexError': float(abs(us - analytic).max()), 'passed': bool(abs(us - analytic).max() < 1e-12)})
    cases = []
    for step, exterior in [(.004, 1.2), (.002, 1.2), (.002, 2.4)]:
        c, c0, l, info = model(step, .736, exterior)
        for length in [18.29220023555932, 57.74250214669671]:
            data = np.array([scatter(c, l, length / 1000, f) for f in frequencies])
            mixed = transform @ data @ transform.T
            near = abs(mixed[:, 2, 0])
            far = abs(mixed[:, 6, 0])
            info_case = dict(info, lengthMm=length, differentialNearEndWorstDB=float(20 * np.log10(max(near.max(), 1e-15))), differentialFarEndWorstDB=float(20 * np.log10(max(far.max(), 1e-15))), differentialNearEndAt8GHzDB=float(20 * np.log10(max(near[79], 1e-15))), differentialFarEndAt8GHzDB=float(20 * np.log10(max(far[79], 1e-15))), differentialNearEndAt10GHzDB=float(20 * np.log10(max(near[99], 1e-15))), differentialFarEndAt10GHzDB=float(20 * np.log10(max(far[99], 1e-15))), maximumSingularValue=float(np.linalg.svd(data, compute_uv=False).max()), maximumReciprocityResidual=float(abs(data - data.transpose(0, 2, 1)).max()), maximumLosslessUnitaryResidual=float(abs(data.conj().transpose(0, 2, 1) @ data - np.eye(8)).max()), capacitanceMatrixFPerM=c.tolist(), vacuumCapacitanceMatrixFPerM=c0.tolist(), inductanceMatrixHPerM=l.tolist())
            cases.append(info_case)
            print(json.dumps({k: info_case[k] for k in ['stepMm', 'exteriorMm', 'lengthMm', 'differentialNearEndWorstDB', 'differentialFarEndWorstDB']}), flush=True)
    controls.append({'name': 'All FEM residuals below 1e-9 and positive capacitance matrices', 'passed': all(c[s]['relativeResidual'] < 1e-9 and c[s]['minimumCapacitanceEigenvalue'] > 0 for c in cases for s in ['dielectricSolve', 'vacuumSolve'])})
    controls.append({'name': 'Lossless MTL matrices reciprocal, passive and unitary', 'passed': all(c['maximumSingularValue'] < 1 + 1e-9 and c['maximumReciprocityResidual'] < 1e-9 and c['maximumLosslessUnitaryResidual'] < 1e-9 for c in cases)})
    convergence = []
    for length in [18.29220023555932, 57.74250214669671]:
        rows = [r for r in cases if r['lengthMm'] == length]
        convergence.append({'lengthMm': length, 'meshWorstCrosstalkChangeDB': max(abs(rows[0][k] - rows[1][k]) for k in ['differentialNearEndWorstDB', 'differentialFarEndWorstDB']), 'domainWorstCrosstalkChangeDB': max(abs(rows[1][k] - rows[2][k]) for k in ['differentialNearEndWorstDB', 'differentialFarEndWorstDB'])})
    controls.append({'name': 'Mesh and exterior worst-crosstalk changes below assumed 0.25dB numerical screening tolerance', 'passed': all(max(v['meshWorstCrosstalkChangeDB'], v['domainWorstCrosstalkChangeDB']) < .25 for v in convergence)})
    result = {'scope': 'Quasi-TEM straight-trunk adjacent-pair stress model; not actual complete-channel extraction.', 'frequencyBandGHz': [.1, 16.], 'sourceSha256': digest(INPUT / 'board.circuit.json'), 'handoffSha256': digest(INPUT / 'field-solver-handoff.json'), 'stackupSha256': digest(INPUT / 'selected.json'), 'elapsedSeconds': time.monotonic() - start, 'controls': controls, 'cases': cases, 'convergence': convergence, 'completeChannelQualified': False, 'decision': 'No demonstrated need to change checked trunk spacing in this stress screen. There is no supplied victim/noise budget or multiple-aggressor sum; actual-channel crosstalk remains unqualified. Coupled launches, bends, vias, components and package/connector internals are excluded.', 'assumptions': ['Two symmetric parallel pairs on one uninterrupted GND plane for the entire modeled length.', 'Foreign trace-edge separation is .736 mm (8 times .092 mm); checked ordinary trunks exceed this separation. Launch regions are excluded from that routing check.', 'No coplanar guard copper is included. Full-parallel stress cases are not asserted to be mathematical upper bounds on arbitrary actual routing.', 'PEC conductors and nondispersive dielectric/mask. No radiation, conductor/dielectric loss, launch asymmetry, vias or terminal/package models.', 'Both ends of every individual conductor are terminated in 42.5 ohms; normalized differential port reference is85ohms. All other ports matched.'], 'sources': ['https://ars.copernicus.org/articles/1/63/2003/ars-1-63-2003.html', 'https://ggiemr-repository.engineering.nottingham.ac.uk/UoN/SACAMOS/blame/cd89a218bead3e47bd2fbd08a882fc93ed99b372/DOCUMENTATION/THEORY_MANUAL/Tex/mtlequa.tex'], 'inputSha256': {str(p.relative_to(ROOT)): digest(p) for p in [Path(__file__), ROOT / 'simulations/pcie-tx/cross_section.py', INPUT / 'board.circuit.json', INPUT / 'field-solver-handoff.json', INPUT / 'selected.json']}}
    (OUT / 'crosstalk.json').write_text(json.dumps(result, indent=2) + '\n')
    assert all(c['passed'] for c in controls)


if __name__ == '__main__':
    main()
