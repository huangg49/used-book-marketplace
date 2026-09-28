"""Render/check the current business baseline; never overwrite v1.0 artifacts.

python -m pip install --target .tmp/docs-render Markdown==3.7
python scripts/build-business-docs.py [--check]
"""
from pathlib import Path
from html import escape
import hashlib
import json
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.tmp/docs-render'))
try:
    import markdown
except ImportError:
    raise SystemExit('Install Markdown3.7 into .tmp/docs-render; see script docstring.')

SOURCES = [
    ('srs', 'SRS 1.1', 'docs/SRS_V1_1.md'),
    ('rules', 'Nghiệp vụ điểm và đấu giá', 'docs/features/LOCAL_HANDOVER_AUCTION.md'),
    ('model', 'Mô hình và trạng thái', 'docs/features/LOCAL_TRANSACTION_DESIGN.md'),
    ('acceptance', 'Use case và nghiệm thu', 'docs/features/LOCAL_TRANSACTION_ACCEPTANCE.md'),
    ('changes', 'Thay đổi 1.0 → 1.1', 'docs/SRS_V1_1_CHANGELOG.md'),
]
OUTPUT = ROOT / 'docs/SRS_V1_1.html'
DOCS = [ROOT / p for _, _, p in SOURCES] + [ROOT / p for p in [
    'README.md', 'AGENTS.md', 'docs/README.md', 'docs/TEAMWORK.md',
    'docs/REACT_NATIVE_START.md', 'docs/architecture/README.md',
    'docs/features/LISTING_SLICE.md', 'docs/features/LISTING_ACCEPTANCE.md',
    'docs/features/LISTING_DATA_CONTRACT.md', 'docs/features/LISTING_API_INDEX.md',
    'docs/features/LISTING_IMPLEMENTATION_PLAN.md', 'docs/SRS_V1_1_VERIFICATION.md',
    'docs/adr/0007-hcm-handover-auction-scope.md',
]]

def read(path):
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')

def render():
    sections = []
    mapping = {(ROOT / p).resolve(): slug for slug, _, p in SOURCES}
    for slug, label, path in SOURCES:
        source = ROOT / path
        renderer = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'])
        body = renderer.convert(read(source))
        body = body.replace('</h1>', '</h1><details class="section-toc"><summary>Mục lục phần này</summary>' + renderer.toc + '</details>', 1)
        # Namespaced heading anchors avoid repeated headings across annexes.
        body = re.sub(r'id="([^"]+)"', lambda m: f'id="{slug}-{m[1]}"', body)
        def link(match):
            href = match[1]
            if href.startswith(('http:', 'https:', 'mailto:')):
                return match[0]
            if href.startswith('#'):
                return f'href="#{slug}-{href[1:]}"'
            target = (source.parent / unquote(href.split('#')[0])).resolve()
            if target in mapping:
                anchor = mapping[target]
                return f'href="#{anchor}"'
            import os
            relative = os.path.relpath(target, OUTPUT.parent).replace('\\', '/')
            return f'href="{escape(relative, quote=True)}"'
        body = re.sub(r'href="([^"]+)"', link, body)
        body = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>',
            r'<details class="diagram-source"><summary>Mã nguồn sơ đồ trạng thái Mermaid — mở để xem</summary><pre><code>\1</code></pre></details>', body, flags=re.S)
        sections.append(f'<section id="{slug}" aria-label="{escape(label)}">{body}</section>')
    nav = ''.join(f'<a href="#{slug}">{escape(label)}</a>' for slug, label, _ in SOURCES)
    return '''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lật lại · SRS 1.1 — TP.HCM, điểm giao nhận và đấu giá</title>
<style>
:root{color-scheme:light;--paper:#fbf7ed;--ink:#252c23;--green:#244b3a;--line:#d2cbbb}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 Georgia,"Times New Roman",serif}
a{color:var(--green);text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #b56724;outline-offset:4px}
header{padding:40px max(24px,calc((100vw - 1180px)/2));background:var(--green);color:#fff9e9;border-bottom:8px solid #bd7142}
header .eyebrow{font:700 13px/1.4 system-ui,sans-serif;letter-spacing:2px}header h1{color:inherit;font-size:clamp(30px,4vw,50px);line-height:1.15;margin:15px 0}
header p{max-width:800px;margin:10px 0}nav{display:flex;flex-wrap:wrap;gap:10px 24px;padding:18px 24px;border-bottom:1px solid var(--line);font:600 15px/1.5 system-ui,sans-serif}
main{max-width:1230px;margin:auto;padding:24px}section{padding:25px 0 50px;border-bottom:2px solid var(--line);scroll-margin-top:20px}
h1,h2,h3,h4{line-height:1.3;color:var(--green)}section h1{font-size:32px}h2{font-size:26px;margin-top:42px}h3{font-size:21px;margin-top:30px}
p,li{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font:15px/1.55 system-ui,sans-serif;margin:22px 0;background:#fffdf7}
th,td{border:1px solid var(--line);text-align:left;padding:11px 13px;vertical-align:top;overflow-wrap:anywhere}th{background:#e7ecdf;color:#203c2e}
tr:nth-child(even) td{background:#f5f2e9}code{font:14px/1.6 Consolas,monospace;overflow-wrap:anywhere}pre{overflow:auto;padding:18px;background:#eeeade;border:1px solid var(--line)}
blockquote{border-left:4px solid #bd7142;margin:20px 0;padding:1px 20px;background:#f2ecdf}summary{cursor:pointer;font:600 15px/1.6 system-ui,sans-serif;padding:14px;border:1px solid var(--line)}
footer{padding:30px 24px;font:14px/1.6 system-ui,sans-serif}.table-scroll{overflow:auto;max-width:100%;margin:20px 0}.table-scroll table{margin:0;min-width:600px}
@media(max-width:700px){body{font-size:16px}main{padding:14px}header{padding:30px 20px}section h1{font-size:27px}th,td{padding:9px}}
@media print{nav,.diagram-source{display:none}body{background:white;font-size:11pt}header{background:white;color:#203c2e;padding:10px}main{max-width:none;padding:0}table{font-size:9pt}tr{break-inside:avoid}h2,h3{break-after:avoid}.table-scroll{overflow:visible}.table-scroll table{min-width:0}a{color:inherit}}
</style></head><body>
<header><div class="eyebrow">LẬT LẠI · SÁCH CŨ. CHƯƠNG MỚI.</div><h1>Đặc tả nghiệp vụ 1.1</h1>
<p>TP.HCM · Giữ giao tận nơi · Hai điểm giao nhận mô phỏng · Đấu giá có giới hạn</p>
<p>Baseline ngày 26/09/2026. Đây là yêu cầu triển khai, không phải báo cáo các tính năng đã chạy. 38 nhóm nghiệm thu mới chưa được thực thi.</p></header>
<nav aria-label="Các phần tài liệu">''' + nav + '</nav><main>' + ''.join(sections).replace('<table>', '<div class="table-scroll" tabindex="0" role="region" aria-label="Bảng dữ liệu cuộn ngang"><table>').replace('</table>', '</table></div>') + '''</main>
<footer>Lật lại · Bộ SRS1.1 gồm bản chính và các phụ lục quy phạm. Không tiền thật, không carrier thật, không chứng nhận chính hãng. Snapshot1.0 giữ nguyên trong repository.</footer>
</body></html>
'''

def check():
    rules = read(ROOT / SOURCES[1][2])
    matrix = read(ROOT / SOURCES[3][2])
    expected = {f'FR-{prefix}{n:02}' for prefix, count in [('H',12),('T',4),('AU',10)] for n in range(1,count+1)}
    definitions = re.findall(r'^(FR-(?:H|T|AU)\d{2}):', rules, re.M)
    assert len(definitions) == len(set(definitions)) == 26
    assert set(definitions) == expected
    rows = re.findall(r'^\| (AC-(?:H|AU)\d{2}) \| (.*?) \|', matrix, re.M)
    assert {r[0] for r in rows} == {f'AC-{p}{n:02}' for p,count in [('H',24),('AU',14)] for n in range(1,count+1)}
    covered = set(re.findall(r'FR-(?:H|T|AU)\d{2}', ' '.join(r[1] for r in rows)))
    assert covered == expected, expected - covered
    assert len(re.findall(r'^\| UC-(?:H|AU)\d{2} \|', matrix, re.M)) == 12
    assert len(re.findall(r'^\| POL-\d{2} \|', rules, re.M)) == 16
    assert 'chưa chạy' in matrix and '0.4.0' in read(ROOT/'docs/features/LOCAL_TRANSACTION_DESIGN.md')
    links = 0
    for doc in DOCS:
        for target in re.findall(r'\]\(([^)]+)\)', read(doc)):
            if target.startswith(('http:', 'https:', 'mailto:', '#')):
                continue
            target = unquote(target.strip('<>').split('#')[0])
            assert (doc.parent / target).exists(), f'Broken link: {doc.relative_to(ROOT)} -> {target}'
            links += 1
    manifest=json.loads(read(ROOT/'docs/artifact-manifest.json'))
    preserved=0
    for entry in manifest['files']:
        path=entry['path']
        if not (path.startswith('docs/deliverables/SRS_') or path.startswith('docs/deliverables/Use_Case_Diagrams/') or path.endswith('Bo_Use_Case_SRS_v1.zip')):
            continue
        raw=(ROOT/path).read_bytes()
        if Path(path).suffix in {'.md','.html','.puml','.svg'}:
            raw=raw.replace(b'\r\n',b'\n')
        assert hashlib.sha256(raw).hexdigest()==entry['sha256'], f'Historical snapshot changed: {path}'
        preserved+=1
    # Specification examples only, not runtime business tests.
    assert 200_000+30_000+30_000 == 190_000+60_000+10_000
    assert 230_000 == 220_000+10_000
    def price(maxima, floor=200_000, manual=0):
        values=sorted(maxima,reverse=True)
        competition=200_000 if len(values)==1 else min(values[0],values[1]+50_000)
        return max(floor,competition,manual)
    assert [price([400_000]),price([400_000,250_000],manual=250_000),price([400_000,350_000],300_000,350_000),price([400_000,450_000],400_000,450_000)] == [200_000,300_000,400_000,450_000]
    assert price([400_000,400_000])==400_000 and price([300_000],manual=300_000)==300_000
    html=read(OUTPUT)
    assert html==render(), 'Offline HTML is stale; run without --check.'
    assert '<script' not in html and 'cdn.' not in html
    ids=re.findall(r'\bid="([^"]+)"',html)
    assert len(ids)==len(set(ids)), 'Duplicate HTML anchors'
    for anchor in re.findall(r'href="#([^"]+)"',html):
        assert anchor in ids, f'Missing HTML anchor {anchor}'
    print(f'PASS: 26 requirements, 12 use cases, 38 acceptance groups, 16 policies; {links} local links; {preserved} historical snapshots unchanged; fee/Auto examples; offline HTML current.')

if __name__ == '__main__':
    if '--check' not in sys.argv:
        OUTPUT.write_text(render(),encoding='utf-8',newline='\n')
        print('Rendered docs/SRS_V1_1.html (offline, no external resources).')
    check()
