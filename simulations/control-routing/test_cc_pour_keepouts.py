import copy
import unittest
from cc_pour_keepouts import generate


class CcPourInputTests(unittest.TestCase):
    def fixture(self):
        return {'routes': [{'net': 'ASM_CC1', 'layer': 'inner3', 'width': .2032,
                            'points': [[0, 0], [2, 0]], 'baseMarginMm': .26,
                            'ownViaCoords': [[0, 0], [2, 0]]}],
                'vias': [{'x': x, 'y': 0, 'outer_diameter': .25} for x in [0, 2]]}

    def test_missing_endpoint_via_is_rejected_before_geometry_is_emitted(self):
        data = self.fixture()
        data['vias'].pop()
        result = generate(data)
        self.assertFalse(result['passed'])
        self.assertEqual(result['keepouts'], [])
        self.assertEqual(result['violations'][0]['missingOwnViaCoords'], [[2, 0]])

    def test_complete_input_proves_clearance_without_touching_vias(self):
        data = self.fixture()
        original = copy.deepcopy(data)
        result = generate(data)
        self.assertTrue(result['passed'])
        self.assertTrue(result['keepouts'])
        self.assertEqual(result['proofs'][0]['missingDesiredAreaMm2'], 0)
        self.assertEqual(result['proofs'][0]['viaOverlapAreaMm2'], 0)
        self.assertEqual(data, original)

    def test_foreign_via_blocking_the_required_moat_is_rejected(self):
        data = self.fixture()
        data['vias'].append({'x': 1, 'y': .35, 'outer_diameter': .25})
        self.assertFalse(generate(data)['passed'])


if __name__ == '__main__':
    unittest.main()
