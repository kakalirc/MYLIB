"""Builds guide-teacher.pdf, guide-student.pdf and guide-parent.pdf in the repo root.

Run from anywhere:  python3 guides-src/build.py   (needs Node with Playwright, pdftotext, pypdf)
Edit the wording in teacher.py, student.py and parent.py; the look lives in guide.py.
"""
import os, re, subprocess, sys
from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out')
sys.path.insert(0, HERE)

import importlib  # noqa: E402
from guide import CONTACT  # noqa: E402

FOOTER_CSS = """@font-face { font-family: 'G'; src: url(inter-latin.woff2) format('woff2'); font-weight: 100 900; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; } @font-face { font-family: 'G'; src: url(inter-latin-ext.woff2) format('woff2'); font-weight: 100 900; unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; } @page { size: A5; margin: 0; } body { margin: 0; font-family: 'G', sans-serif; }
.p { width: 148mm; height: 210mm; position: relative; break-after: page; }
.f { position: absolute; left: 12mm; right: 12mm; bottom: 7mm; display: flex; justify-content: space-between; align-items: center;
     font-size: 6.8pt; color: #8a877f; border-top: 0.6pt solid #e3ddd0; padding-top: 2mm; }
.f b { color: #1e1f23; font-weight: 700; } .f .o { color: #f55138; font-weight: 800; letter-spacing: -0.06em; margin-right: 1mm; }
.f .n { color: #1e1f23; font-weight: 700; font-size: 7.4pt; }"""


def render(html, pdf):
    path = os.path.join(HERE, os.path.basename(pdf).replace('.pdf', '.html'))
    with open(path, 'w') as f:
        f.write(html)
    subprocess.run(['node', os.path.join(HERE, 'render.js'), path, pdf], check=True, cwd=HERE)
    os.remove(path)


def page_numbers(pdf):
    pages = {}
    for i in range(len(PdfReader(pdf).pages)):
        text = subprocess.run(['pdftotext', '-f', str(i + 1), '-l', str(i + 1), pdf, '-'], capture_output=True, text=True).stdout
        for sid in re.findall(r'@@([\w-]+)@@', text):
            pages.setdefault(sid, i + 1)
    return pages


def build(mod):
    g = mod.guide()
    os.makedirs(OUT, exist_ok=True)
    draft = os.path.join(OUT, f'draft-{g.role}.pdf')
    render(g.html(), draft)
    pages = page_numbers(draft)
    order = ['contents'] + [x[0] for x in g.sections]
    total = len(PdfReader(draft).pages)
    for a, b in zip(order, order[1:] + [None]):
        span = (pages[b] if b else total) - pages[a]
        if span > 1:
            print(f'  {a} runs to {span} pages')
    body = os.path.join(OUT, f'body-{g.role}.pdf')
    render(g.html(pages, markers=False), body)
    n = len(PdfReader(body).pages)
    if n != len(PdfReader(draft).pages):
        raise SystemExit('page count changed between passes')
    # Footer on every page except the front and back covers.
    feet = ''.join(
        '<div class="p">' + ('' if i in (1, n) else
        f'<div class="f"><span><span class="o">//</span><b>My LIB</b> &middot; {g.role_title} guide</span>'
        f'<span>Help: WhatsApp {CONTACT["phone"]}</span><span class="n">{i}</span></div>') + '</div>'
        for i in range(1, n + 1))
    footer = os.path.join(OUT, f'footer-{g.role}.pdf')
    render(f'<!doctype html><html><head><meta charset="utf-8"><style>{FOOTER_CSS}</style></head><body>{feet}</body></html>', footer)
    reader, foot = PdfReader(body), PdfReader(footer)
    writer = PdfWriter(clone_from=reader)
    for i, page in enumerate(writer.pages):
        page.merge_page(foot.pages[i])
    writer.add_metadata({'/Title': f'Know Your My LIB App: {g.role_title} guide', '/Author': CONTACT['company']})
    writer.compress_identical_objects()
    dest = os.path.join(ROOT, f'guide-{g.role}.pdf')
    with open(dest, 'wb') as f:
        writer.write(f)
    print(f'{dest}: {n} pages, {os.path.getsize(dest) // 1024} KB')


if __name__ == '__main__':
    for name in sys.argv[1:] or ['teacher', 'student', 'parent']:
        build(importlib.import_module(name))
