"""Lumped source with a physical gap that is independent of mesh density."""
import numpy as np
from em3d_line import index

def add_feed(fdtd,csx,mesh,number,spec,amplitude,gap_mm):
    x,y,width,z,gnd=spec
    xg,yg,zg=[mesh.GetLines(a,do_sort=True) for a in ['x','y','z']]
    ix,iy=index(xg,x),index(yg,y)
    assert 8<ix<len(xg)-9 and 8<iy<len(yg)-9,'Feed overlaps lateral PML'
    x,y=float(xg[ix]),float(yg[iy]);z=float(zg[index(zg,z)]);gnd=float(zg[index(zg,gnd)])
    target=z+np.sign(gnd-z)*gap_mm
    gap=float(zg[index(zg,target)]);assert abs(gap-target)<1e-8,(gap,target)
    post=csx.AddMetal(f'feed_return_post_{number}')
    post.AddBox([x-1e-6,y-1e-6,gnd],[x+1e-6,y+1e-6,gap],priority=120)
    port=fdtd.AddLumpedPort(number,42.5,[x,y,gap],[x,y,z],'z',excite=amplitude,priority=150)
    # Read current through one explicitly selected dual face in the resistor.
    # The voltage probe still integrates the complete, multi-cell element.
    kz=int(np.searchsorted(zg,(z+gap)/2,side='right')-1)
    midpoint=float((zg[kz]+zg[kz+1])/2)
    assert min(z,gap)<midpoint<max(z,gap)
    probe=csx.GetPropertiesByName(port.I_filenames[0])[0].GetPrimitive(0)
    probe.SetStart([(xg[ix-1]+xg[ix])/2+1e-6,(yg[iy-1]+yg[iy])/2+1e-6,midpoint])
    probe.SetStop([(xg[ix]+xg[ix+1])/2-1e-6,(yg[iy]+yg[iy+1])/2-1e-6,midpoint])
    return port,{'start':[x,y,gap],'stop':[x,y,z],'physicalGapMm':float(abs(z-gap)),
        'gapMeshCells':abs(index(zg,gap)-index(zg,z)),
        'expectedCurrentIndices':[[ix-1,iy-1,kz],[ix,iy,kz]],
        'lateralPMLCellClearance':[ix-8,len(xg)-9-ix,iy-8,len(yg)-9-iy]}
