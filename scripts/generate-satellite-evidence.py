"""Editorial map rendering, not a runtime dependency. Requires Pillow and curl.
Real Esri tiles; keep attribution. Does not invent scenery or encode coordinates.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import json, math, subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
questions = json.loads((root / 'content/questions.json').read_text())
base = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
def download(url):
    return subprocess.check_output(['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '30', url])
info = json.loads(download(base + '?f=json'))
manifest = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'service': base, 'copyrightText': info.get('copyrightText'), 'imageryDate': 'varies by location; not verified', 'zoom': 15, 'maps': []}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
font_big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
for q in questions:
    lat, lng = q['coordinate']; n = 2 ** 15; ts = 256
    cx = (lng + 180) / 360 * n * ts
    cy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * ts
    x0, y0 = round(cx - 320), round(cy - 200)
    jobs = [(x,y) for x in range(x0 // ts, (x0 + 639) // ts + 1) for y in range(y0 // ts, (y0 + 399) // ts + 1)]
    def tile(job):
        x,y=job
        return x,y,Image.open(BytesIO(download(f'{base}/tile/15/{y}/{x}'))).convert('RGB')
    image=Image.new('RGB',(640,400))
    with ThreadPoolExecutor(max_workers=5) as ex:
        for x,y,im in ex.map(tile,jobs):image.paste(im,(x*ts-x0,y*ts-y0))
    d=ImageDraw.Draw(image)
    d.ellipse((305,185,335,215), outline='#071d20', width=5)
    d.ellipse((305,185,335,215), outline='#fff2c9', width=2)
    for line in [(320,176,320,188),(320,212,320,224),(296,200,308,200),(332,200,344,200)]:
        d.line(line,fill='#071d20',width=5); d.line(line,fill='#fff2c9',width=2)
    d.ellipse((318,198,322,202),fill='#fff2c9')
    d.rounded_rectangle((585,10,626,65),radius=4,fill='#112328')
    d.text((600,15),'N',fill='#fff2c9',font=font_big);d.polygon([(605,35),(599,52),(611,52)],fill='#fff2c9')
    scale=round(500/(40075016.686*math.cos(math.radians(lat))/(n*ts)))
    d.rectangle((12,347,scale+32,380),fill='#112328');d.text((22,349),'500 m',fill='#fff2c9',font=font)
    d.line([(22,367),(22,374),(22+scale,374),(22+scale,367)],fill='#fff2c9',width=2)
    d.rectangle((0,383,640,400),fill='#112328')
    d.text((8,386),'Imagery (c) ' + info['copyrightText'].removeprefix('Source: '),fill='#e3e6d6',font=font)
    out=root/'content/evidence'/f"{q['id']}.jpg";image.save(out,quality=84,optimize=True)
    manifest['maps'].append({'id':q['id'],'bytes':out.stat().st_size,'tiles':len(jobs)})
    print(q['id'],out.stat().st_size,flush=True)
(root/'research/satellite-evidence-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
