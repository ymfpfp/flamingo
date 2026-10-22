import unittest
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from prepare_obstacles import cover_polygon


class PourObstacles(unittest.TestCase):
    def test_preserves_room_inside_a_pour_opening(self):
        pour = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)],
                       [[(1, 1), (3, 1), (3, 3), (1, 3)]])
        cover = unary_union([box(*r) for r in cover_polygon(pour)])
        self.assertLess(pour.difference(cover.buffer(1e-9)).area, 1e-10)
        self.assertFalse(cover.intersects(box(1.2, 1.2, 2.8, 2.8)))

    def test_covers_sloped_edges_conservatively(self):
        pour = Polygon([(0.013, .017), (3.14, .2), (1.75, 2.37)])
        cover = unary_union([box(*r) for r in cover_polygon(pour)])
        self.assertLess(pour.difference(cover.buffer(1e-9)).area, 1e-10)
        self.assertLess(cover.area - pour.area, .5)
