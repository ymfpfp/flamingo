"""Check generalized current probes against the previously calibrated line."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from CSXCAD import ContinuousStructure
from openEMS import openEMS
from openEMS.ports import UI_data
import em3d as base
import em3d_line as line
from batch_em3d import measurement,OUT

def run(args):
    dest=OUT/'rotation'/f'control-{args.axis}-{args.resolution:g}-3-{args.excitation}';dest.mkdir(parents=True,exist_ok=True)
    fdtd=openEMS(NrTS=600000,EndCriteria=1e-9);fdtd.SetTimeStepFactor(.8);fdtd.SetGaussExcite(8e9,8e9)
    fdtd.SetBoundaryCond(['PML_8']*4+['PEC','PML_8']);csx=ContinuousStructure();fdtd.SetCSX(csx);mesh=csx.GetGrid();mesh.SetDeltaUnit(.001)
    options=argparse.Namespace(graded_control=True,align_control_edges=True,control_edge_thirds=True,z_refinement=2,port_style='edge')
    refs,meta=base.setup_control(fdtd,csx,mesh,args.resolution,3,options)
    axis=0 if args.axis=='x' else 1
    if axis==1:
        x,y=mesh.GetLines('x',do_sort=True),mesh.GetLines('y',do_sort=True);mesh.SetLines('x',y);mesh.SetLines('y',x)
        for primitive in csx.GetAllPrimitives():
            start=primitive.GetStart();stop=primitive.GetStop();primitive.SetStart([start[1],start[0],start[2]]);primitive.SetStop([stop[1],stop[0],stop[2]])
    extension=csx.AddMetal('measurement_feed_extensions');mask=csx.AddMaterial('feed_extension_mask',epsilon=3.8)
    active={'d1':[1,-1,0,0],'c1':[1,1,0,0]}[args.excitation];sources=[];gaps=[];measurements=[]
    for n,(x,y,w,z,gnd) in enumerate(refs,1):
        xy=[x,y] if axis==0 else [y,x];feed=xy.copy();feed[axis]+=(-1 if n<=2 else 1)*.4;feed[axis]=round(feed[axis],9)
        normal=1-axis
        for part in range(2):
            width=w-.01778*(part+.5)/2;start=[0.,0.,z+part*base.T/2];stop=[0.,0.,z+(part+1)*base.T/2]
            start[axis]=min(xy[axis],feed[axis]);stop[axis]=max(xy[axis],feed[axis]);start[normal]=round(xy[normal]-width/2,9);stop[normal]=round(xy[normal]+width/2,9)
            extension.AddBox(start,stop,priority=10)
        start=[0.,0.,z];stop=[0.,0.,z+base.T+.01524];start[axis]=min(xy[axis],feed[axis]);stop[axis]=max(xy[axis],feed[axis]);start[normal]=xy[normal]-w/2;stop[normal]=xy[normal]+w/2;mask.AddBox(start,stop,priority=3)
        mesh.AddLine('xy'[axis],[xy[axis],feed[axis]])
        source,gap=line.add_feed(fdtd,csx,mesh,n,[*feed,w,z,gnd],active[n-1],robust=True);sources.append(source);gaps.append(gap)
        measurements.append(measurement(csx,mesh,n,{'xy':xy,'axis':axis,'z':z,'groundZ':gnd,'widthMm':w,'incomingSign':1 if n<=2 else -1}))
    source=Path(__file__).read_bytes();dependency=Path(base.__file__).read_bytes()
    meta.update({'channel':'ROTATION_CONTROL','axis':args.axis,'resolutionMm':args.resolution,'excitation':args.excitation,
        'measurementStyle':'line','lineMeasurement':measurements,'terminalGaps':gaps,
        'scriptSha256':hashlib.sha256(source).hexdigest(),'baseSourceSha256':hashlib.sha256(dependency).hexdigest()})
    (dest/'driver-source.py').write_bytes(source);(dest/'base-driver-source.py').write_bytes(dependency)
    (dest/'generalized-probes-source.py').write_bytes(Path(__file__).with_name('batch_em3d.py').read_bytes())
    (dest/'setup.json').write_text(json.dumps(meta,indent=2)+'\n');fdtd.Write2XML(str(dest/'model.xml'))
    (dest/'ABORT').unlink(missing_ok=True);(dest/'status.json').write_text(json.dumps({'state':'running'}))
    result=fdtd.Run(str(dest),cleanup=True,numThreads=8,engine='gpu',showProbeDiscretization=True)
    if result not in [None,0]:raise RuntimeError(str(result))
    voltage=[];current=[]
    for p in measurements:
        voltage.append(UI_data([p['voltageFilename']],str(dest),base.F).ui_f_val[0]);values=UI_data(p['currentFilenames'],str(dest),base.F).ui_f_val
        current.append(sum(w*v for w,v in zip(p['currentWeights'],values)))
    a=(np.array(voltage).T+42.5*np.array(current).T)/2;b=(np.array(voltage).T-42.5*np.array(current).T)/2;am=a@line.T.T;bm=b@line.T.T;k=0 if args.excitation=='d1' else 2
    np.savez_compressed(dest/'waves.npz',frequency=base.F,a=a,b=b,am=am,bm=bm,response=bm/am[:,k,None]);(dest/'status.json').write_text(json.dumps({'state':'completed'}));print(json.dumps({'directory':str(dest)}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--axis',choices=['x','y'],default='y');p.add_argument('--resolution',type=float,default=.005);p.add_argument('--excitation',choices=['d1','c1'],default='d1');run(p.parse_args())
