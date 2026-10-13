from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
from io import BytesIO
import base64
root=Path('C:/Users/Admin/.codex/visualizations/2026/10/10/01a12611-5641-72d0-a524-dc2eacfc79ba/pdf-review')
files=sorted(root.glob('page-*.png'))
assert len(files)==10,len(files)
sheet=Image.new('RGB',(1100,5*432),'#dce3df')
for i,p in enumerate(files):
 im=Image.open(p);im.thumbnail((540,410));x=(i%2)*550+5;y=(i//2)*432+18;sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x,y-14),p.stem,fill='black')
b=BytesIO();sheet.save(b,format='PNG');print(base64.b64encode(b.getvalue()).decode())
