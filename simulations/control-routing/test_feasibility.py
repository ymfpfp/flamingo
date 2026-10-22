import unittest
from shapely.geometry import Point, box
from check_feasibility import attachment_space


class LaunchTests(unittest.TestCase):
    def test_offset_pad_attachment_is_considered(self):
        pad = Point(0, 0).buffer(.1)
        # A centered 0.2 mm wire fails the 0.1 mm gap to the left wall,
        # while a right-offset attachment still has legal space.
        self.assertFalse(attachment_space(pad, [box(-1, -1, -.15, 1)], .2, .1).is_empty)

    def test_no_offset_can_fit_between_both_walls(self):
        pad = Point(0, 0).buffer(.1)
        self.assertTrue(attachment_space(pad, [box(-1, -1, -.15, 1), box(.15, -1, 1, 1)], .2, .1).is_empty)


if __name__ == '__main__': unittest.main()
