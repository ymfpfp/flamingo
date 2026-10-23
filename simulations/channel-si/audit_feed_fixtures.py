"""Check saved feed meshes and passive resistor measurements without fitting S."""
from pathlib import Path
import argparse,json,xml.etree.ElementTree as ET
import numpy as np
from openEMS.ports import UI_data
from analyze_extraction import F

def inspect(path):
    setup=json.loads((path/'setup.json').read_text())
    xml=ET.parse(path/'model.xml').getroot()
    grid=xml.find('ContinuousStructure/RectilinearGrid')
    counts=[len(grid.find(a+'Lines').text.split(',')) for a in ['X','Y','Z']]
    clearances=[]
    for gap in setup['terminalGaps']:
        ix,iy,_=gap['expectedCurrentIndices'][1]
        clearance=[ix-8,counts[0]-9-ix,iy-8,counts[1]-9-iy]
        clearances.append(clearance)
    outside=all(min(c)>0 for c in clearances)
    # Passive gap voltage/current should agree with R, apart from the
    # small physical displacement current of the one-cell gap.
    active={'d1':[0,1],'d2':[2,3],'c1':[0,1],'c2':[2,3]}[setup['excitation']]
    passive=[i for i in range(4) if i not in active]
    u=np.array(UI_data([f'port_ut_{i+1}' for i in passive],str(path),F).ui_f_val).T
    current=np.array(UI_data([f'port_it_{i+1}' for i in passive],str(path),F).ui_f_val).T
    residual=np.abs((u+42.5*current)/(u-42.5*current))
    worst=float(residual.max())
    return {'directory':str(path),'lateralPMLCellClearances':clearances,
        'feedsOutsideLateralPML':outside,'passiveGapIncidentToReflectedRatio':worst,
        'passiveGapLimit':.01,'passed':bool(outside and worst<.01)}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('suite',type=Path)
    args=parser.parse_args();rows=[]
    for path in sorted(args.suite.iterdir()):
        if not (path/'status.json').exists():continue
        if json.loads((path/'status.json').read_text())['state']!='completed':continue
        rows.append(inspect(path))
    result={'passed':bool(rows and all(row['passed'] for row in rows)),'cases':rows}
    (args.suite/'feed-fixture-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
