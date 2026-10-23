"""Read exported amCharts waveform data without aligning different time axes."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np


def waveforms(path):
    with path.open(newline='') as stream:
        reader = csv.DictReader(stream)
        names = reader.fieldnames
        pairs = {name: 'x'+name for name in names if not name.startswith('x') and 'x'+name in names}
        result = {name: [] for name in pairs}
        for row in reader:
            for name, xname in pairs.items():
                if row.get(name) not in ('', None) and row.get(xname) not in ('', None):
                    result[name].append((float(row[xname])*1e-3, float(row[name])))
    arrays = {name: np.asarray(points, dtype=float) for name, points in result.items()}
    for name, data in arrays.items():
        assert len(data)>1 and np.all(np.isfinite(data)), name
        assert np.all(np.diff(data[:,0]) >= 0), name+' time is not monotonic'
    return arrays


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv')
    parser.add_argument('--after-ms', type=float, default=0)
    parser.add_argument('--out')
    args = parser.parse_args()
    path = Path(args.csv)
    arrays = waveforms(path)
    results = []
    for name, data in arrays.items():
        valid = data[data[:,0] >= args.after_ms*1e-3]
        if not len(valid):
            continue
        tail = valid[valid[:,0] >= valid[0,0]+.8*(valid[-1,0]-valid[0,0])]
        minimum, maximum = int(np.argmin(valid[:,1])), int(np.argmax(valid[:,1]))
        results.append(dict(name=name, samples=len(valid), startMS=float(valid[0,0]*1e3),
                            endMS=float(valid[-1,0]*1e3), minimum=float(valid[minimum,1]),
                            minimumAtMS=float(valid[minimum,0]*1e3), maximum=float(valid[maximum,1]),
                            maximumAtMS=float(valid[maximum,0]*1e3),
                            final20PercentMedian=float(np.median(tail[:,1]))))
    result = dict(sourceFile=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                  afterMS=args.after_ms, xAxisUnit='msec, from the visible WEBENCH chart',
                  interpretation='Extrema of the exported samples, not certified continuous-time bounds. Each trace uses its own x column.',
                  traces=results)
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
