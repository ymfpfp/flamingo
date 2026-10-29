"""Regression for a real VCCH branch that conducts through the SPI barrel."""
import copy
import json
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'power-distribution'))
from check_layout import model
from check_slot_dc import solve

class PlatedBarrelRegression(unittest.TestCase):
    def test_header_barrel_and_matrix_reuse(self):
        board=json.loads(Path(os.environ.get('BOARD_TEST_FIXTURE',str(Path(__file__).resolve().parents[2]/'dist/board.circuit.json'))).read_text())
        case=('VCCH',[('ATX','pin'+str(i)) for i in [1,2,12,13]],[('R_SPI_CS','pin1')],.001)
        base=solve(board,case,.12,reuse_mesh=True)
        half=solve(board,(*case[:3],.0005),.12,reuse_mesh=True)
        self.assertGreater(base['platedHoleBarrels'],0)
        self.assertTrue(half['meshReuse']['cacheHit'])
        self.assertEqual(base['platedHoleBarrels'],half['platedHoleBarrels'])
        self.assertGreater(base['dropMV'],0)
        self.assertAlmostEqual(base['dropMV']/2,half['dropMV'],places=10)
        # Removing the actual plated hole must break the branch. A shared
        # schematic net alone must never repair physical connectivity.
        *_,port=model(board)
        spi_port=port('SPI','pin3')['pcb_port_id']
        without=[e for e in copy.deepcopy(board) if not(e['type']=='pcb_plated_hole' and e.get('pcb_port_id')==spi_port)]
        self.assertLess(len(without),len(board))
        with self.assertRaisesRegex(ValueError,'disconnected mesh load R_SPI_CS'):
            solve(without,case,.12,reuse_mesh=True)

if __name__=='__main__':
    unittest.main()
