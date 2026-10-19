"""Trace the supplied badge into a single-ink SVG with three knockout contours."""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

artwork = Path(__file__).resolve().parent.parent / "assets" / "artwork"
pixels = np.array(Image.open(artwork / "ts-mark-source.png").convert("RGBA"))


def contours(mask):
    edges = {}
    height, width = mask.shape
    for y, x in zip(*np.where(mask)):
        for outside, a, b in [
            (y == 0 or not mask[y - 1, x], (x, y), (x + 1, y)),
            (x == width - 1 or not mask[y, x + 1], (x + 1, y), (x + 1, y + 1)),
            (y == height - 1 or not mask[y + 1, x], (x + 1, y + 1), (x, y + 1)),
            (x == 0 or not mask[y, x - 1], (x, y + 1), (x, y)),
        ]:
            if outside:
                if a in edges:
                    raise ValueError("Ambiguous contour junction")
                edges[a] = b
    rings = []
    while edges:
        start = next(iter(edges))
        ring, point = [], start
        while True:
            ring.append(point)
            point = edges.pop(point)
            if point == start:
                break
        if len(ring) > 10:
            rings.append(np.array(ring, dtype=float))
    return rings


def simplify(points, tolerance=0.3):
    # Smooth pixel stair steps by less than one source pixel (0.03 mm on PCB).
    points = (np.roll(points, 1, axis=0) + 2 * points + np.roll(points, -1, axis=0)) / 4

    def rdp(path):
        delta = path[-1] - path[0]
        norm = np.linalg.norm(delta)
        if norm < 1e-9:
            distances = np.linalg.norm(path - path[0], axis=1)
        else:
            offsets = path - path[0]
            distances = np.abs(delta[0] * offsets[:, 1] - delta[1] * offsets[:, 0]) / norm
        index = int(np.argmax(distances))
        if distances[index] <= tolerance:
            return [path[0], path[-1]]
        return rdp(path[:index + 1])[:-1] + rdp(path[index:])

    split = int(np.argmax(np.linalg.norm(points - points[0], axis=1)))
    return rdp(points[:split + 1])[:-1] + rdp(np.vstack([points[split:], points[0]]))[:-1]


tile = contours(pixels[:, :, 3] > 128)
cutouts = contours((pixels[:, :, 3] > 128) & (pixels[:, :, :3].min(axis=2) > 200))
assert len(tile) == 1 and len(cutouts) == 3, "Expected a tile, dot, t, and s"



# The small upper-left contour is the circular dot. Fit its center and radius
# to the pixel boundary, then retain a true circle instead of that boundary.
dot = min(cutouts, key=lambda ring: ring[:, 1].mean())
matrix = np.column_stack([2 * dot[:, 0], 2 * dot[:, 1], np.ones(len(dot))])
cx, cy, constant = np.linalg.lstsq(matrix, (dot ** 2).sum(axis=1), rcond=None)[0]
radius = float(np.sqrt(constant + cx ** 2 + cy ** 2))
letters = [simplify(ring) for ring in cutouts if ring is not dot]
(artwork / "ts-mark-trace.json").write_text(json.dumps({
    "dot": {"x": (float(cx) - 100) * .03, "y": (100 - float(cy)) * .03, "radius": radius * .03},
    "letters": [[{"x": (float(x) - 100) * .03, "y": (100 - float(y)) * .03} for x, y in ring] for ring in letters],
}) + '\n')
subprocess.run(["bun", str(Path(__file__).with_name("generate-ts-mark-arcs.mjs"))], check=True)
