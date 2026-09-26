#!/usr/bin/env python3
"""Generate the reproducible Lumen Plymouth background."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math, random, sys

W, H = 1920, 1080
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("lumen-splash.png")
random.seed(17)

def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for p in candidates:
        if p.exists(): return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()

# Deep navy vertical/radial gradient.
img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):
    for x in range(W):
        radial = max(0, 1 - math.hypot((x-W*.62)/(W*.68), (y-H*.47)/(H*.82)))
        violet = max(0, 1 - math.hypot((x-W*.70)/(W*.52), (y-H*.46)/(H*.70)))
        px[x, y] = (3+int(4*radial), 6+int(5*radial), 19+int(14*radial+8*violet))

# Quiet grid.
grid = Image.new("RGBA", (W, H), (0,0,0,0)); gd = ImageDraw.Draw(grid)
for x in range(0, W, 120): gd.line((x,0,x,H), fill=(48,73,159,16), width=1)
for y in range(0, H, 120): gd.line((0,y,W,y), fill=(48,73,159,16), width=1)
img = Image.alpha_composite(img.convert("RGBA"), grid)

# Circuit traces around the edges.
traces = Image.new("RGBA", (W, H), (0,0,0,0)); td = ImageDraw.Draw(traces)
def trace(points, color=(25,107,228,95), width=2):
    td.line(points, fill=color, width=width, joint="curve")
    ex, ey = points[-1]; td.ellipse((ex-4,ey-4,ex+4,ey+4), fill=(39,128,255,155))
for i in range(8):
    y=70+i*46; length=270+random.randrange(0,180); jog=80+random.randrange(0,100)
    trace([(24,y),(90+i*7,y),(120+i*7,y-24),(jog+80,y-24),(jog+110,y-52),(length,y-52)])
for i in range(6):
    y=H-64-i*48; length=260+random.randrange(0,170); jog=70+random.randrange(0,100)
    trace([(24,y),(92+i*8,y),(124+i*8,y+22),(jog+90,y+22),(jog+120,y+48),(length,y+48)])
for i in range(5):
    y=90+i*52; trace([(W-24,y),(W-92-i*7,y),(W-126-i*7,y-24),(W-280-i*28,y-24)],(103,52,235,76))
img=Image.alpha_composite(img,traces.filter(ImageFilter.GaussianBlur(4)))
img=Image.alpha_composite(img,traces)

# Orb: glow, shell, rotating-style rings, and a six-petal seed geometry.
cx, cy, radius = 1390, 505, 330
glow=Image.new("RGBA",(W,H),(0,0,0,0)); gp=glow.load()
for y in range(max(0,cy-radius-130),min(H,cy+radius+130)):
    for x in range(max(0,cx-radius-130),min(W,cx+radius+130)):
        d=math.hypot(x-cx,y-cy); a=int(90*max(0,1-d/(radius+130))**2)
        if a: gp[x,y]=(108,52,255,a)
img=Image.alpha_composite(img,glow.filter(ImageFilter.GaussianBlur(24)))
orb=Image.new("RGBA",(W,H),(0,0,0,0)); od=ImageDraw.Draw(orb)
for r in range(radius,0,-3):
    t=1-r/radius; od.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(43+int(36*t),16+int(18*t),110+int(80*t),4+int(24*t)))
for r,a,w in [(radius,235,4),(radius-20,100,2),(radius-82,190,3),(radius-150,170,2)]:
    od.ellipse((cx-r,cy-r,cx+r,cy+r),outline=(178,119,255,a),width=w)
for r in (390,430,475): od.ellipse((cx-r,cy-r,cx+r,cy+r),outline=(105,53,238,55),width=2)
petal=145
for angle in range(0,360,60):
    a=math.radians(angle); pcx=cx+math.cos(a)*petal*.72; pcy=cy+math.sin(a)*petal*.72
    od.ellipse((pcx-petal,pcy-petal,pcx+petal,pcy+petal),outline=(225,205,255,190),width=3)
for angle in range(0,360,30):
    a=math.radians(angle); x=cx+math.cos(a)*(radius-12); y=cy+math.sin(a)*(radius-12)
    od.line((cx,cy,x,y),fill=(147,91,255,38),width=1)
    od.ellipse((x-4,y-4,x+4,y+4),fill=(235,221,255,190))
od.ellipse((cx-8,cy-8,cx+8,cy+8),fill=(255,255,255,245))
img=Image.alpha_composite(img,orb.filter(ImageFilter.GaussianBlur(12)))
img=Image.alpha_composite(img,orb)

# Orb star points and pedestal.
stars=Image.new("RGBA",(W,H),(0,0,0,0)); sd=ImageDraw.Draw(stars)
for sy in (cy-radius,cy-radius//2,cy,cy+radius):
    sd.line((cx-38,sy,cx+38,sy),fill=(221,198,255,160),width=2); sd.line((cx,sy-38,cx,sy+38),fill=(221,198,255,160),width=2)
    sd.ellipse((cx-5,sy-5,cx+5,sy+5),fill=(255,255,255,255))
for i in range(7):
    rw=430-i*45; rh=68-i*7; sd.ellipse((cx-rw,880-rh,cx+rw,880+rh),outline=(112,55,235,95-i*8),width=2)
img=Image.alpha_composite(img,stars.filter(ImageFilter.GaussianBlur(10))); img=Image.alpha_composite(img,stars)

# Wordmark.
draw=ImageDraw.Draw(img)
title=font(118,True); tagline=font(28,False); status=font(18,False)
draw.text((122,410),"LUMEN OS",font=title,fill=(247,245,252,255),stroke_width=1,stroke_fill=(255,255,255,80))
tag="T H E   F U T U R E   H A S   A   S O U L"
draw.text((130,555),tag,font=tagline,fill=(222,215,234,245))
draw.ellipse((132,663,140,671),fill=(178,121,255,255))
draw.text((154,656),"AWAKENING",font=status,fill=(166,151,188,220))
img.convert("RGB").save(out,optimize=True)
print(out)
