"""Build original vector brand studies. Run from any directory with Python + fontTools.

All lettering is outlined from the bundled OFL fonts. No remote assets or fonts.
JSON is the source for this proposal; existing application tokens remain unchanged.
"""
from pathlib import Path
from html import escape
import json
import re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parent
BRAND = ROOT.parent
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)
TOKENS = json.loads((ROOT / "identity.tokens.json").read_text(encoding="utf-8"))
C = TOKENS["palette"]
FONTS = {
    "display": instantiateVariableFont(TTFont(BRAND / "fonts/Lora[wght].ttf"), {"wght": 600}),
    "body": TTFont(BRAND / "fonts/BeVietnamPro-Regular.ttf"),
    "bold": TTFont(BRAND / "fonts/BeVietnamPro-Bold.ttf"),
}

def text(value, x, y, size, color="forest", face="body", tracking=0):
    font = FONTS[face]
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    paths, advance = [], 0
    for char in value:
        if ord(char) not in cmap:
            raise ValueError(f"Missing glyph in {face}: {char!r}")
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({advance:.3f},0)"/>')
        advance += font["hmtx"][name][0] + tracking / scale
    return f'<g fill="{C.get(color, color)}" transform="translate({x},{y}) scale({scale}, {-scale})">{"".join(paths)}</g>'

def rect(x,y,w,h,fill):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{C.get(fill,fill)}"/>'

def path(d, fill):
    return f'<path d="{d}" fill="{C.get(fill,fill)}"/>'

def line(x1,y1,x2,y2,color="rule",width=1):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{C.get(color,color)}" stroke-width="{width}"/>'

def logo(x,y,w,variant="primary"):
    source = (BRAND / f"logos/lat-lai-horizontal-{variant}.svg").read_text(encoding="utf-8")
    inner = re.sub(r"^.*?<title>.*?</title>", "", source, count=1, flags=re.S).rsplit("</svg>",1)[0]
    return f'<g transform="translate({x},{y}) scale({w/460})">{inner}</g>'

def symbol(x,y,size,variant="primary"):
    source = (BRAND / f"logos/lat-lai-symbol-{variant}.svg").read_text(encoding="utf-8")
    inner = re.sub(r"^.*?<title>.*?</title>", "", source, count=1, flags=re.S).rsplit("</svg>",1)[0]
    return f'<g transform="translate({x},{y}) scale({size/128})">{inner}</g>'

def svg(name,w,h,content,title,description):
    source = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>{content}</svg>\n'
    (OUT / f"{name}.svg").write_text(source,encoding="utf-8")

def page_turn():
    # Extrapolate the original logo's turning page into an open-book study.
    s = path("M36 130 Q160 73 277 137 L277 580 Q160 514 36 560Z", "paper")
    s += path("M298 137 Q428 78 568 117 L568 560 Q426 526 298 580Z", "leaf")
    for offset in [0,8,16]:
        s += f'<path d="M{44+offset} 579 Q160 {536+offset} 277 {601+offset}M298 {601+offset} Q426 {548+offset} {568-offset} {579+offset}" stroke="{C["paper"]}" stroke-width="2" fill="none"/>'
    s += path("M298 137 L425 0 L425 329 L298 459Z", "terracotta")
    s += text("Gửi người",72,295,28,face="display")
    s += text("đọc sau.",72,337,28,face="display")
    s += line(74,380,231,380,"muted") + line(74,395,216,395,"muted")
    s += text("SÁCH CŨ.",356,488,15,face="bold",tracking=1)
    s += text("CHƯƠNG MỚI.",356,513,15,face="bold",tracking=1)
    return s

svg("page-turn",610,640,page_turn(),"Dấu chuyền tay", "Hai trang sách mở và trang cam đang lật. Trang trái ghi Gửi người đọc sau; trang phải ghi Sách cũ. Chương mới.")

hero = rect(0,0,1600,1000,"forest")
hero += logo(68,48,240,"white") + text("MUA BÁN & TRAO ĐỔI SÁCH CŨ",1070,96,16,"paper","bold",1)
hero += line(72,159,1528,159,"#547165")
hero += text("Đọc xong.",72,355,118,"paper","display")
hero += text("Đọc tiếp.",72,505,118,"leaf","display")
hero += text("Cuốn sách bạn khép lại",79,589,26,"paper")
hero += text("có thể mở ra điều gì đó cho một người khác.",79,632,26,"paper")
hero += text("BÁN LẠI  /  ĐỔI SÁCH  /  ĐỌC TIẾP",79,775,18,"paper","bold",1)
hero += f'<g transform="translate(933,207) scale(.92)">{page_turn()}</g>'
hero += rect(0,878,1600,122,"paper")
hero += text("DẤU CHUYỀN TAY",72,932,17,face="bold",tracking=2)
hero += text("Một cuốn sách. Một người đọc mới.",72,972,23,face="display")
hero += text("LẬT LẠI  /  NHẬN DIỆN 1.1",1185,950,14,face="bold")
svg("campaign",1600,1000,hero,"Đọc xong. Đọc tiếp.","Áp phích Lật lại: sách bạn khép lại có thể mở ra điều gì đó cho người khác. Nền xanh trầm, chữ kem và lá non, trang cam lật giữa hai trang sách.")

note = rect(0,0,1000,740,"paper")
note += rect(0,0,18,740,"terracotta") + logo(48,37,226)
note += text("THẺ NHẮN GỬI",705,82,14,face="bold",tracking=1)
note += line(62,142,936,142,"border")
note += text("Gửi người đọc sau,",62,240,57,face="display")
note += text("Có một đoạn mình đã đọc lại nhiều lần.",66,315,24)
note += text("Mong bạn cũng tìm thấy đoạn của riêng mình.",66,357,24)
note += text("LỜI NHẮN CỦA BẠN",66,439,13,face="bold",tracking=1)
note += line(66,496,932,496,"border") + line(66,551,932,551,"border")
note += text("Từ",66,624,18) + line(108,630,417,630,"border")
note += text("đến bạn.",444,624,24,face="display")
note += text("SÁCH CŨ. CHƯƠNG MỚI.",66,704,14,face="bold",tracking=1)
note += path("M900 650H970V720Z","terracotta")
svg("handoff-note",1000,740,note,"Gửi người đọc sau", "Thẻ nhắn gửi mẫu để kẹp vào sách. Có lời nhắn gợi ý và dòng trống để người gửi tự viết; không phải đánh giá hay lịch sử người dùng thật.")

bookmark = rect(0,0,420,1160,"paper")
bookmark += rect(0,0,420,416,"forest") + logo(45,30,230,"white")
bookmark += text("Đọc",42,202,84,"paper","display") + text("tiếp.",42,308,84,"leaf","display")
bookmark += path("M316 316L380 246V399L316 469Z","terracotta")
bookmark += text("Dừng ở một trang.",40,529,24,face="display")
bookmark += text("Tiếp ở một người.",40,568,24,face="display")
bookmark += text("MỘT ĐOẠN MUỐN GIỮ LẠI",40,660,12,face="bold",tracking=.4)
for y in [721,779,837,895]: bookmark += line(40,y,380,y,"border")
bookmark += text("Trang",40,967,15) + line(94,972,200,972,"border")
bookmark += text("LẬT LẠI",40,1070,14,face="bold",tracking=1)
bookmark += text("Sách cũ. Chương mới.",40,1102,17)
svg("bookmark",420,1160,bookmark,"Bookmark Đọc tiếp", "Dấu trang với chỗ ghi một đoạn muốn giữ lại và số trang. Mẫu RGB, chưa có bleed hoặc chuyển đổi màu in.")

board = rect(0,0,1600,1200,"paper")
board += text("LẬT LẠI / DẤU CHUYỀN TAY",64,62,16,face="bold",tracking=1)
board += text("HỆ NHẬN DIỆN 1.1",1280,62,14,face="bold")
board += rect(64,105,950,575,"forest")
board += logo(94,135,212,"white")
board += text("Đọc xong.",102,334,90,"paper","display")
board += text("Đọc tiếp.",102,445,90,"leaf","display")
board += text("MỘT CUỐN SÁCH. MỘT NGƯỜI ĐỌC MỚI.",108,595,15,"paper","bold")
board += f'<g transform="translate(650,241) scale(.52)">{page_turn()}</g>'
board += logo(1070,128,375)
board += line(1070,289,1536,289,"border")
board += text("Gửi người",1070,368,52,face="display")
board += text("đọc sau.",1070,436,52,face="display")
board += text("Từ trang sách đang lật",1070,520,20)
board += text("đến cuốn sách chuyền tay.",1070,557,20)
board += text("GIỮ LOGO. PHÁT TRIỂN NGÔN NGỮ.",1070,648,13,face="bold")
names=[("forest","Xanh trầm"),("paper","Giấy kem"),("terracotta","Cam đất"),("ink","Mực"),("leaf","Lá non")]
for i,(key,name) in enumerate(names):
    x=64+i*300
    board += rect(x,726,272,104,key)
    if key=="paper": board += f'<rect x="{x}" y="726" width="272" height="104" fill="none" stroke="{C["border"]}"/>'
    board += text(name,x,864,18,face="bold") + text(C[key],x,896,15)
board += line(64,942,1536,942,"border")
board += text("Lora",64,1028,56,face="display")
board += text("Chữ mang nhịp đọc.",64,1080,23,face="display")
board += text("Be Vietnam Pro",635,1017,34,face="bold")
board += text("Rõ tình trạng sách. Rõ giá. Rõ người bán.",635,1065,22)
board += text("Ắ ằ Ặ ấ ễ ộ ớ ự · 125.000 ₫",635,1105,24)
board += text("ĐIỂM NHỚ: TRANG LẬT / NHỊP GÁY SÁCH / LỜI NHẮN CHUYỀN TAY",64,1166,13,face="bold",tracking=.3)
svg("identity-board",1600,1200,board,"Lật lại: hệ nhận diện Dấu chuyền tay", "Tổng quan hướng thiết kế: logo gốc, typography Lora và Be Vietnam Pro, xanh trầm, giấy kem, cam đất, mực và lá non; trang lật được phát triển thành ngôn ngữ đồ họa.")

proof=rect(0,0,1100,500,"paper")+text("LOGO / KIỂM TRA KÍCH THƯỚC",40,55,18,face="bold")
for x,size in [(40,16),(190,24),(370,32),(590,48),(840,64)]:
    proof+=symbol(x,120,size,"mono" if size==16 else "primary")
    proof+=text(f"{size} px",x,250,18)
proof+=logo(40,320,160)+text("Logo ngang: 160 px",40,440,16)
proof+=rect(390,300,670,170,"forest")+logo(424,330,200,"white")
proof+=text("Nền tối: bản trắng",695,397,18,"paper")
svg("size-proof",1100,500,proof,"Kiểm tra logo ở kích thước thật", "Biểu tượng tại 16, 24, 32, 48 và 64 pixel. Bản một màu ở 16 pixel. Logo ngang ở 160 pixel và logo trắng trên nền tối. Xem ở tỉ lệ 100 phần trăm.")

def luminance(color):
    rgb=[int(color[i:i+2],16)/255 for i in [1,3,5]]
    linear=[v/12.92 if v<=0.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(v*w for v,w in zip(linear,[.2126,.7152,.0722]))

def contrast(fg,bg):
    a,b=sorted([luminance(fg),luminance(bg)])
    return (b+.05)/(a+.05)

report=[]
for pair in TOKENS["contrastPairs"]:
    ratio=contrast(C[pair["foreground"]],C[pair["background"]])
    if ratio < pair["minimum"]: raise ValueError(f"Contrast failure: {pair}: {ratio}")
    report.append({**pair,"ratio":round(ratio,4),"passed":True})
report.append({"foreground":"terracotta","background":"paper","ratio":round(contrast(C["terracotta"],C["paper"]),4),"use":"Decoration only; use rustText for small text"})
(ROOT / "contrast-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
css = "/* Generated by build_identity.py from identity.tokens.json. Proposal scope only. */\n:root {\n"
for key,value in C.items():
    kebab=re.sub(r"[A-Z]",lambda m:"-"+m.group(0).lower(),key)
    css+=f"  --{kebab}: {value};\n"
css+="}\n"
(ROOT / "palette.css").write_text(css,encoding="utf-8")
for face in FONTS:
    sample = TOKENS["typography"]["vietnameseProof"]
    if face == "display":
        sample = sample.split(" · 125.")[0]  # Prices belong to Be Vietnam Pro; bundled Lora has no dong glyph.
    text(sample,0,0,20,face=face)
print(f"Built 6 outlined SVG studies; {len(TOKENS['contrastPairs'])} contrast pairs passed; Vietnamese glyphs checked in all 3 fonts, currency in body/bold.")
