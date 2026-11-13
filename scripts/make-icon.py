"""Generate all Pulse Relay brand assets from the same two 32-unit outlines."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
assets = root / "desktop" / "assets"
public = root / "frontend" / "public"
brand = public / "brand"
assets.mkdir(parents=True, exist_ok=True)
brand.mkdir(parents=True, exist_ok=True)
outer = [(4,3),(18,3),(28,12),(28,20),(18,29),(4,29),(4,22),(9,22),(9,24),(16,24),(23,18),(23,14),(16,8),(4,8)]
relay = [(4,13),(14,13),(18,16),(14,19),(4,19),(4,17),(11,17),(13,16),(11,15),(4,15)]
def paths(ink,accent):
    return ''.join('<polygon points="'+' '.join(f'{x},{y}' for x,y in points)+'" fill="'+color+'"/>' for points,color in [(outer,ink),(relay,accent)])
def svg(name,inner,view="0 0 32 32"):
    (brand/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="DevPulse">{inner}</svg>\n',encoding="utf-8")
for name,ink,accent in (("symbol","#e3efef","#55d7c5"),("mono-light","#f3f6f7","#f3f6f7"),("mono-dark","#16252b","#16252b")):
    svg(name+".svg",paths(ink,accent))
svg("horizontal.svg",paths("#dfecec","#55d7c5")+'<text x="37" y="23" font-family="Segoe UI, sans-serif" font-size="22" font-weight="600" letter-spacing="-1" fill="#dfecec">DevPulse</text>',"0 0 128 32")
svg("tile.svg",'<rect width="32" height="32" rx="7" fill="#172b30"/><g transform="translate(3 3) scale(.8125)">'+paths("#e3efef","#55d7c5")+'</g>')
for name in ("devpulse.svg","favicon.svg"):
    (public/name).write_bytes((brand/"tile.svg").read_bytes())
size=1024
im=Image.new("RGBA",(size,size))
draw=ImageDraw.Draw(im)
draw.rounded_rectangle((12,12,1011,1011),radius=202,fill="#172b30",outline="#436166",width=14)
for points,color in [(outer,"#e3efef"),(relay,"#55d7c5")]:
    draw.polygon([(int(96+x*26),int(96+y*26)) for x,y in points],fill=color)
im.save(assets/"icon.png")
im.save(assets/"icon.ico",sizes=[(v,v) for v in (16,20,24,32,40,48,64,128,256)])
im.save(assets/"icon.icns",format="ICNS")
