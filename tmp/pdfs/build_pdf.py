from pathlib import Path
from io import BytesIO
import base64
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
base=Path(__file__).resolve().parent
out=base.parent.parent/'output'/'pdf'/'thesa-current-ui-ux.pdf'
pages=[
('01-login','Account access','Split login screen with Otto illustration. Account and Google sign-in remain unconfigured.'),
('02-dashboard','Your theses','Sample projects show how the dashboard looks with multiple drafts. New-project controls are functional.'),
('03-editor','Manuscript workspace','Illustrative thesis text in the working editor. Chapters, formatting and browser autosave are available.'),
('04-otto','Otto - floating panel','Otto opens above the manuscript. Chat, review and source-grounded answers are not connected yet.'),
('05-docked','Otto - docked panel','Dock reserves a column beside the document; Float restores the wider writing area.'),
('06-sources','Source library','Current empty state and summary layout. Upload, processing and literature-review generation are pending.'),
('07-evidence','Evidence viewer','The saved sample draft appears beside an empty source viewer. No PDF or cited passage is fabricated.'),
('08-empty','Start a new thesis','A blank project offers an outline, source-library navigation, or a new chapter to write from scratch.'),
('09-dark','Dark appearance','The same working manuscript in the dark theme, with the sample draft preserved.'),
]
W,H=1080,810
buffer=BytesIO()
c=canvas.Canvas(buffer,pagesize=(W,H))
c.setTitle('Thesa - Current UI/UX Walkthrough')
c.setAuthor('Thesa')
c.setSubject('Actual application screens with illustrative thesis content; current implementation, October 2026')
def shell(title,description,n):
 c.setFillColor(HexColor('#F6F7F8'));c.rect(0,0,W,H,fill=1,stroke=0)
 c.setFillColor(HexColor('#0A7F5A'));c.roundRect(36,H-51,7,24,3,fill=1,stroke=0)
 c.setFillColor(HexColor('#0E1512'));c.setFont('Helvetica-Bold',19);c.drawString(54,H-44,title)
 c.setFont('Helvetica',9);c.setFillColor(HexColor('#5B6670'));c.drawRightString(W-36,H-38,'THESA / CURRENT UI WALKTHROUGH')
 c.setStrokeColor(HexColor('#DCE3DF'));c.line(36,52,W-36,52)
 c.setFillColor(HexColor('#36473E'));c.setFont('Helvetica',9);c.drawString(36,35,description)
 c.setFont('Helvetica',8);c.setFillColor(HexColor('#5B6670'));c.drawString(36,19,'Actual app captures | Illustrative drafts only; no real research findings or invented citations | 12 October 2026')
 c.drawRightString(W-36,19,f'{n:02d} / 10')
for n,(name,title,description) in enumerate(pages,1):
 shell(title,description,n)
 c.drawImage(ImageReader(str(base/(name+'.png'))),36,69,width=1008,height=672,mask='auto')
 c.showPage()
shell('Mobile workspace','Responsive editor and Otto panel. Chapter, document and assistant navigation remain available at the bottom.',10)
for name,x,label in [('10-mobile',178,'Document'),('11-mobile-otto',600,'Otto assistant')]:
 c.drawImage(ImageReader(str(base/(name+'.png'))),x,89,width=300,height=649.23,mask='auto')
 c.setFont('Helvetica-Bold',10);c.setFillColor(HexColor('#0E1512'));c.drawCentredString(x+150,72,label)
c.showPage();c.save()
r=PdfReader(BytesIO(buffer.getvalue()));assert len(r.pages)==10
print(base64.b64encode(buffer.getvalue()).decode('ascii'))

