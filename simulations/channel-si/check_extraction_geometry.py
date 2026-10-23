"""Inspect native CSXCAD materials and terminal meshes for a new extraction."""
from pathlib import Path
import argparse,json,re,tempfile,xml.etree.ElementTree as ET
import numpy as np
from CSXCAD import ContinuousStructure

p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args()
directory=args.directory;setup=json.loads((directory/'setup.json').read_text())
tree=ET.parse(directory/'model.xml')
with tempfile.NamedTemporaryFile(suffix='.xml') as f:
    ET.ElementTree(tree.getroot().find('ContinuousStructure')).write(f.name)
    csx=ContinuousStructure();assert not csx.ReadFromXML(f.name)
mesh=csx.GetGrid()
def name(point):
    prop=csx.GetPropertyByCoordPriority(point)
    return prop.GetName() if prop else 'air'
terminals=[]
for i,terminal in enumerate(setup['terminalGaps'],1):
    a=np.array(terminal['start']);b=np.array(terminal['stop'])
    z=mesh.GetLines('z',do_sort=True)
    intervals=int(np.count_nonzero((z>=min(a[2],b[2])-1e-9)&(z<=max(a[2],b[2])+1e-9))-1)
    material=name((a+b)/2)
    # Lumped elements are operator extensions, not volume materials.
    resistor=tree.getroot().find(f"ContinuousStructure/Properties/LumpedElement[@Name='port_resist_{i}']")
    assert resistor is not None and float(resistor.attrib['R'])==42.5
    assert material not in ['exported_copper_PEC','terminal_return_posts'],material
    if setup['portStyle']=='edge':assert intervals==1,(i,intervals)
    terminals.append({'port':i,'zMeshIntervals':intervals,'materialAtGap':material})
    current=directory/f'port_it_{i}'
    if current.exists() and 'expectedCurrentIndices' in terminal:
        actual=[[int(n) for n in re.search(r'\[([^]]+)\]',line).group(1).split(',')]
                for line in current.read_text().splitlines()[:4] if '-coordinates:' in line]
        assert actual==terminal['expectedCurrentIndices'],(i,actual,terminal['expectedCurrentIndices'])
        terminals[-1]['nativeCurrentIndices']=actual
checks=[]
if setup.get('lateralBoundary','').startswith('Edge cross'):
    xl,yl,xh,yh=setup['boundsMm']
    zs=[.02,-.05,-.105,-.3,-.67,-.75,-.795,-1.,-1.36,-1.42,-1.49]
    for axis in ['x','y']:
        g=mesh.GetLines(axis,do_sort=True)
        for side,positions in [('low',(g[:8]+g[1:9])/2),('high',(g[-9:-1]+g[-8:])/2)]:
            tangential=np.linspace(yl+.017,yh-.017,25) if axis=='x' else np.linspace(xl+.017,xh-.017,25)
            for t in tangential:
                for z in zs:
                    materials=[name([normal,t,z] if axis=='x' else [t,normal,z]) for normal in positions]
                    assert len(set(materials))==1,(axis,side,t,z,materials)
            checks.append({'axis':axis,'side':side,'normalSamples':len(positions),'tangentialSamples':25,'zSamples':len(zs),'uniform':True})
result={'terminals':terminals,'lateralPMLMaterialChecks':checks,'signalViaLandChecks':setup.get('signalViaLandChecks',[])}
(directory/'geometry-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
