"""Render real aerial photos for solved-location reports. Requires Pillow/curl.
No invented scenery; no target marker. Runtime serves committed JPEG files only.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import json, math, subprocess
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent
base='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
def download(url):return subprocess.check_output(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','30',url])
info=json.loads(download(base+'?f=json'))
credit=info['copyrightText'].removeprefix('Source: ')
manifest={'generatedAt':datetime.now(timezone.utc).isoformat(),'service':base,'copyrightText':info['copyrightText'],'imageryDate':'not verified; varies by location','zoom':17,'maps':[]}
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
(root/'content/report-images').mkdir(exist_ok=True)
for q in json.loads((root/'content/questions.json').read_text()):
 lat,lng=q['coordinate'];n=2**17;ts=256;w,h=1000,625
 cx=(lng+180)/360*n*ts;cy=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n*ts
 x0,y0=round(cx-w/2),round(cy-h/2)
 jobs=[(x,y) for x in range(x0//ts,(x0+w-1)//ts+1) for y in range(y0//ts,(y0+h-1)//ts+1)]
 def tile(job):
  x,y=job;return x,y,Image.open(BytesIO(download(f'{base}/tile/17/{y}/{x}'))).convert('RGB')
 image=Image.new('RGB',(w,h))
 with ThreadPoolExecutor(max_workers=5) as ex:
  for x,y,t in ex.map(tile,jobs):image.paste(t,(x*ts-x0,y*ts-y0))
 d=ImageDraw.Draw(image);d.rectangle((0,h-22,w,h),fill='#112328');d.text((10,h-18),'Imagery (c) '+credit,fill='#eceadf',font=font)
 out=root/'content/report-images'/f"{q['id']}.jpg";image.save(out,quality=82,optimize=True)
 manifest['maps'].append({'id':q['id'],'bytes':out.stat().st_size,'tileCount':len(jobs)})
 print(q['id'],out.stat().st_size,flush=True)
(root/'research/report-aerial-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
