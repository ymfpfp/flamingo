import unittest
from shapely.geometry import Point, box, Polygon
from check_local_constraints import local_escape, pad_attachment_diagnostics

class LocalConstraintTests(unittest.TestCase):
    def test_trapped_top_and_forbidden_bottom_is_blocked(self):
        pad=Point(0,0).buffer(.1)
        foreign=[Point(x*.46,y*.46).buffer(.1) for x,y in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]]
        row=local_escape(pad,foreign,.127,.2032,box(-3,-3,3,3))
        self.assertFalse(row['topEscapeOutOf2mmWindowPossible'])
        self.assertTrue(row['blockedUnderFixedCopperAndLiteralRules'])

    def test_trapped_top_does_not_prove_blocked_when_via_space_exists(self):
        pad=Point(0,0).buffer(.1)
        foreign=[Point(x*.46,y*.46).buffer(.1) for x,y in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]]
        self.assertFalse(local_escape(pad,foreign,.127,.2032,Polygon())['blockedUnderFixedCopperAndLiteralRules'])

    def test_an_open_top_escape_is_not_rejected_by_bottom_isolation(self):
        row=local_escape(Point(0,0).buffer(.1),[box(-2,-2,-.4,2)],.127,.2032,box(-3,-3,3,3))
        self.assertTrue(row['topEscapeOutOf2mmWindowPossible'])
        self.assertFalse(row['blockedUnderFixedCopperAndLiteralRules'])

    def test_fixed_pad_limit_is_independent_of_routed_copper(self):
        pad=Point(0,0).buffer(.1)
        pads=[Point(x*.46,y*.46).buffer(.1) for x,y in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]]
        row=pad_attachment_diagnostics(pad,pads,.2032,.381)
        self.assertFalse(row['fixedPadOnlyFullWidthAttachmentPossible'])
        self.assertFalse(row['fixedPadOnlyMinimumViaContactPossible'])
        self.assertLess(row['optimisticMaximumPadClearanceForAttachmentMm'],.381)

    def test_clear_pad_has_attachment_space_at_required_width(self):
        row=pad_attachment_diagnostics(Point(0,0).buffer(.1),[],.254,.1778)
        self.assertTrue(row['fixedPadOnlyFullWidthAttachmentPossible'])
        self.assertTrue(row['fixedPadOnlyMinimumViaContactPossible'])

if __name__=='__main__':unittest.main()
