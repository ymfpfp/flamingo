"""Render material queries from the exact CSXCAD input used by the solver."""
from pathlib import Path
import xml.etree.ElementTree as ET
import tempfile
import numpy as np
from CSXCAD import ContinuousStructure
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/em3d'
model=OUT/'board-USB4_RX2-0.04-3-d1/model.xml'
root=ET.parse(model).getroot()
with tempfile.NamedTemporaryFile(suffix='.xml') as xml:
    ET.ElementTree(root.find('ContinuousStructure')).write(xml.name)
    csx=ContinuousStructure()
    assert not csx.ReadFromXML(xml.name)
x=np.linspace(38.25,40.6,150)
y=np.linspace(102.95,104.65,110)
fig,axes=plt.subplots(1,3,figsize=(12,4),layout='constrained')
for axis,z,title in zip(axes,[.02032,-.105,-1.49],
                        ['Top copper','L2 ground / antipads','Bottom copper']):
    values=np.zeros((len(y),len(x)))
    for iy,yy in enumerate(y):
        for ix,xx in enumerate(x):
            prop=csx.GetPropertyByCoordPriority([xx,yy,z])
            name=prop.GetName() if prop else ''
            values[iy,ix]=(1 if name=='exported_copper_PEC' else
                           2 if name.startswith('port_resist') else 0)
    axis.imshow(values,origin='lower',extent=[x[0],x[-1],y[0],y[-1]],
                vmin=0,vmax=2,cmap='Blues',interpolation='nearest')
    axis.set(title=title,xlabel='PCB X (mm)',ylabel='PCB Y (mm)')
    axis.set_aspect('equal')
    for yy in [103.5,104.1]:axis.plot(39.8,yy,'r+',ms=7)
fig.suptitle('Imported local copper: signal-via lands and reference-plane apertures')
fig.savefig(OUT/'material-slices.png',dpi=160)
