"""Download the exact series model using Samsung's public documented form.

Normal anonymous session and CSRF handling; no account or license acceptance.
"""
from pathlib import Path
import hashlib
import http.cookiejar
import io
import json
import re
import urllib.request
import urllib.parse
import zipfile

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'dist/si-channel-review/references'
BASE='https://weblib.samsungsem.com'
PART='CL05B224KO5NNN'
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders=[('User-Agent','Mozilla/5.0'),('Referer',BASE+'/mlcc/mlcc-ec.do?partNumber='+PART)]
page=opener.open(BASE+'/mlcc/mlcc-ec.do?partNumber='+PART,timeout=60).read().decode()
token=re.search(r'name="_csrf" value="([^"]+)"',page).group(1)
info={'downloadModel':'Precise','downloadType':'Series','downloadFileType':'s2p',
      'paramList':[{'partsName':PART,'vdc':'0','degC':'25','ratedVdc':'16'}]}
req=urllib.request.Request(BASE+'/mlcc/checkDownloadYn.do',json.dumps(info).encode(),
    {'Content-Type':'application/json','X-CSRF-TOKEN':token})
available=json.load(opener.open(req,timeout=60))
rows=available.get('downList',[])
if not rows:
    raise RuntimeError('Manufacturer reports no downloadable file for the exact part')
form={k:v for k,v in info.items() if k!='paramList'}
form['_csrf']=token
for i,row in enumerate(rows):
    for key in ['partNumber','vdc','degC']:
        form[f'paramList[{i}].{key}']=row['partsName' if key=='partNumber' else key]
req=urllib.request.Request(BASE+'/mlcc/download.do',urllib.parse.urlencode(form).encode())
resp=opener.open(req,timeout=60)
data=resp.read()
OUT.mkdir(parents=True,exist_ok=True)
receipt={'url':BASE+'/mlcc/download.do','part':PART,'form':{k:v for k,v in form.items() if k!='_csrf'},
         'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'files':[]}
if zipfile.is_zipfile(io.BytesIO(data)):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if not name.lower().endswith('.s2p'):continue
            content=z.read(name)
            dest=OUT/Path(name).name
            dest.write_bytes(content)
            receipt['files'].append({'path':str(dest.relative_to(ROOT)),
                'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
else:
    if (PART.encode()+b' Multilayer Ceramic Capacitor Sparameter Model' not in data
            or b'# MHz S RI R 50.0' not in data):
        raise RuntimeError('Download was not the exact manufacturer series model')
    dest=OUT/(PART+'-series.s2p');dest.write_bytes(data)
    receipt['files'].append({'path':str(dest.relative_to(ROOT)),'bytes':len(data)})
if not receipt['files']:raise RuntimeError('No S2P in manufacturer download')
(OUT/'samsung-model-receipt.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt,indent=2))
