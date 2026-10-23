"""Extract printable ASCII from Iosevka Term; requires Python fonttools.

Run: python3 scripts/generate-silkscreen-font.py /path/to/IosevkaTerm-Regular.ttc
The checked-in atlas lets circuit builds run without Python or installed fonts.
"""

import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


class OutlinePen(BasePen):
    """Flatten curves with at most two font units of control-point error."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.rings = []

    def _moveTo(self, point):
        self.rings.append([point])

    def _lineTo(self, point):
        self.rings[-1].append(point)

    def _closePath(self):
        ring = self.rings[-1]
        if ring[-1] == ring[0]:
            ring.pop()

    def _endPath(self):
        self._closePath()

    @staticmethod
    def midpoint(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    @staticmethod
    def distance_to_line(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = (dx * dx + dy * dy) ** 0.5
        return abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy) / length if length else float("inf")

    def quadratic(self, a, b, c, depth=0):
        if depth >= 16 or self.distance_to_line(b, a, c) <= 2:
            self._lineTo(c)
            return
        ab, bc = self.midpoint(a, b), self.midpoint(b, c)
        middle = self.midpoint(ab, bc)
        self.quadratic(a, ab, middle, depth + 1)
        self.quadratic(middle, bc, c, depth + 1)

    def _qCurveToOne(self, control, end):
        self.quadratic(self.rings[-1][-1], control, end)

    def cubic(self, a, b, c, d, depth=0):
        if depth >= 16 or max(self.distance_to_line(b, a, d), self.distance_to_line(c, a, d)) <= 2:
            self._lineTo(d)
            return
        ab, bc, cd = self.midpoint(a, b), self.midpoint(b, c), self.midpoint(c, d)
        abc, bcd = self.midpoint(ab, bc), self.midpoint(bc, cd)
        middle = self.midpoint(abc, bcd)
        self.cubic(a, ab, abc, middle, depth + 1)
        self.cubic(middle, bcd, cd, d, depth + 1)

    def _curveToOne(self, b, c, d):
        self.cubic(self.rings[-1][-1], b, c, d)


def area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def contains(ring, point):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def shapes_from_rings(rings):
    # Font outlines use clockwise outer contours and counterclockwise counters.
    outers = [ring for ring in rings if area(ring) < 0]
    shapes = [{"outer": ring, "holes": []} for ring in outers]
    for ring in rings:
        if area(ring) <= 0:
            continue
        owners = [shape for shape in shapes if contains(shape["outer"], ring[0])]
        if not owners:
            raise ValueError("Counter without an enclosing glyph contour")
        min(owners, key=lambda shape: abs(area(shape["outer"])))["holes"].append(ring)
    return shapes


source = Path(sys.argv[1])
font = TTFont(source, fontNumber=0)
if font["name"].getDebugName(1) != "Iosevka Term" or font["name"].getDebugName(2) != "Regular":
    raise ValueError("Expected Iosevka Term Regular")
glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
glyphs = {}
for code in range(32, 127):
    char = chr(code)
    glyph = glyph_set[cmap[code]]
    pen = OutlinePen(glyph_set)
    glyph.draw(pen)
    rings = [[[round(x, 3), round(y, 3)] for x, y in ring] for ring in pen.rings if len(ring) >= 3]
    glyphs[char] = {"advance": glyph.width, "shapes": shapes_from_rings(rings)}

metadata = {
    "family": "Iosevka Term",
    "style": "Regular",
    "version": font["name"].getDebugName(5),
    "unitsPerEm": font["head"].unitsPerEm,
    "capHeight": font["OS/2"].sCapHeight,
    "copyright": font["name"].getDebugName(0),
    "license": "SIL Open Font License 1.1; see OFL.txt",
    "source": source.name,
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "curveToleranceFontUnits": 2,
}
destination = Path(__file__).resolve().parents[1] / "assets/fonts/iosevka-term-ascii.json"
destination.parent.mkdir(parents=True, exist_ok=True)
lines = [json.dumps(metadata, indent=2)[:-2] + ',\n  "glyphs": {']
lines.extend("    " + json.dumps(char) + ": " + json.dumps(glyph, separators=(",", ":"))
             + ("," if char != "~" else "") for char, glyph in glyphs.items())
destination.write_text("\n".join(lines) + "\n  }\n}\n")
print(f"Wrote {len(glyphs)} glyphs to {destination}")
