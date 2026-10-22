"""Page template and building blocks shared by the three My LIB user guides."""
import html

E = html.escape

CONTACT = {
    'phone': '+91 98453 93178',
    'email': 'kakali@kakali.in',
    'web': 'www.libeducation.com',
    'app': 'app.libeducation.com',
    'company': 'LIBXL-Education Private Limited',
    'address': 'No 6, 4th Floor, 2nd Main Road, Arakere, off Bannerghatta Road, Bangalore 560076',
}
EDITION = 'October 2026 edition'

CSS = r"""
@font-face { font-family: 'G'; src: url(inter-latin.woff2) format('woff2'); font-weight: 100 900; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'G'; src: url(inter-latin-ext.woff2) format('woff2'); font-weight: 100 900; unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Noto Sans Devanagari'; src: url(noto-devanagari.woff2) format('woff2'); font-weight: 100 900; }
@page { size: A5; margin: 13mm 12mm 17mm; }
@page cover { margin: 0; }
@page back { margin: 0; }
:root {
  --char: #1e1f23; --char2: #2b2d33; --cream: #ebe7db; --paper: #faf8f3;
  --orange: #f55138; --orange-soft: #fde6e1; --ink: #23252a; --muted: #6b6a66; --line: #e3ddd0;
  --forest: #3c5e42; --gold: #c99a3c; --brick: #a6432e; --app-bg: #f4f0e6; --app-paper: #fbf9f3; --app-line: #ded5bd;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'G', 'Noto Sans Devanagari', sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.5;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: 'cv11', 'ss01'; }
a { color: inherit; text-decoration: none; }
b, strong { font-weight: 650; }

/* cover */
.cover { page: cover; width: 148mm; height: 210mm; background: var(--char); color: var(--cream); position: relative; overflow: hidden; }
.cover .logo { position: absolute; left: 12mm; top: 14mm; width: 46mm; }
.cover .slash { position: absolute; right: -22mm; top: 40mm; width: 26mm; height: 150mm; background: var(--orange); transform: skewX(-22deg); opacity: .95; }
.cover .slash.two { right: 10mm; opacity: .35; }
.cover .body { position: absolute; left: 12mm; right: 40mm; top: 78mm; }
.cover .eyebrow { color: var(--orange); font-weight: 700; letter-spacing: .18em; font-size: 8pt; text-transform: uppercase; }
.cover h1 { font-family: 'G', sans-serif; font-weight: 800; font-size: 31pt; line-height: 1.05; margin: 4mm 0 4mm; letter-spacing: -.01em; }
.cover .role { font-size: 13pt; font-weight: 500; color: #fff; }
.cover .sub { margin-top: 5mm; font-size: 9.5pt; color: #bdb8ab; line-height: 1.55; }
.cover .foot { position: absolute; left: 12mm; right: 12mm; bottom: 12mm; font-size: 7.5pt; color: #9a968b; display: flex; justify-content: space-between; border-top: 1px solid #3a3c43; padding-top: 3mm; }

/* back cover */
.back { page: back; width: 148mm; height: 210mm; background: var(--char); color: var(--cream); position: relative; break-before: page; }
.back .inner { position: absolute; left: 12mm; right: 12mm; top: 30mm; }
.back h2 { font-family: 'G', sans-serif; font-size: 20pt; font-weight: 800; margin: 0 0 2mm; color: #fff; }
.back .lead { color: #bdb8ab; margin-bottom: 9mm; }
.back .row { display: flex; gap: 4mm; padding: 3.2mm 0; border-top: 1px solid #3a3c43; font-size: 10pt; }
.back .row span:first-child { width: 34mm; color: var(--orange); font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; padding-top: .6mm; }
.back .logo { position: absolute; left: 12mm; bottom: 26mm; width: 34mm; }
.back .addr { position: absolute; left: 12mm; right: 12mm; bottom: 10mm; font-size: 7.3pt; color: #9a968b; line-height: 1.5; }

/* sections */
.section { break-before: page; position: relative; }
.mk { position: absolute; left: 0; top: 0; font-size: 2px; color: #fff; }
.kicker { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2.2mm; }
.kicker .k { color: var(--orange); font-weight: 700; letter-spacing: .16em; font-size: 7pt; text-transform: uppercase; }
.kicker .k .new { background: var(--orange); color: #fff; letter-spacing: .08em; border-radius: 3px; padding: .3mm 1.4mm; margin-left: 1.5mm; font-size: 6.4pt; }
.kicker a { font-size: 7pt; color: var(--muted); }
h1.t { font-family: 'G', sans-serif; font-size: 19pt; font-weight: 800; line-height: 1.12; margin: 0 0 1.6mm; letter-spacing: -.01em; color: var(--char); }
.lead { color: var(--muted); font-size: 10pt; margin: 0 0 4mm; }
.rule { height: 1.1mm; width: 14mm; background: var(--orange); margin: 0 0 4mm; border-radius: 1mm; }
h3 { font-size: 10.4pt; font-weight: 700; margin: 3.6mm 0 1.6mm; color: var(--char); break-after: avoid; }
p { margin: 0 0 2.5mm; }
ul.b { margin: 0 0 3mm; padding: 0; list-style: none; }
ul.b li { position: relative; padding-left: 4.2mm; margin-bottom: 1mm; }
ul.b li::before { content: ''; position: absolute; left: .4mm; top: 2.05mm; width: 1.6mm; height: 1.6mm; background: var(--orange); border-radius: 50%; }

/* numbered steps */
.steps { counter-reset: s; margin: 0 0 3mm; }
.step { display: flex; gap: 3.2mm; padding: 1.7mm 0; border-top: 1px solid var(--line); break-inside: avoid; }
.step:first-child { border-top: 0; padding-top: .5mm; }
.step .n { flex: 0 0 6.2mm; height: 6.2mm; border-radius: 50%; background: var(--char); color: #fff; font-weight: 700; font-size: 8.4pt; display: flex; align-items: center; justify-content: center; margin-top: .3mm; }
.step .c .st { display: block; font-weight: 650; font-size: 9.8pt; color: var(--char); margin-bottom: .3mm; }
.step .c { flex: 1; }

/* callouts */
.note { border-radius: 2.2mm; padding: 2.6mm 3.4mm; margin: 2.6mm 0; break-inside: avoid; background: #f3f1ec; border-left: 1.2mm solid var(--char); }
.note.tip { background: #eef3ee; border-left-color: var(--forest); }
.note.warn { background: var(--orange-soft); border-left-color: var(--orange); }
.note .h { font-weight: 700; font-size: 8.2pt; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 1mm; color: var(--char); }
.note ul.b { margin-bottom: 0; }
.note p:last-child { margin-bottom: 0; }

/* tables */
table.t { width: 100%; border-collapse: collapse; margin: 1mm 0 4mm; font-size: 9pt; break-inside: auto; }
table.t th { background: var(--char); color: #fff; text-align: left; font-weight: 600; padding: 1.7mm 2.4mm; font-size: 8.2pt; letter-spacing: .02em; }
table.t td { padding: 1.6mm 2.4mm; border-bottom: 1px solid var(--line); vertical-align: top; }
table.t tr:nth-child(even) td { background: #f8f6f1; }
table.t td:first-child { font-weight: 600; color: var(--char); }
table.t tr { break-inside: avoid; }

/* status chips */
.chips { margin: 1mm 0 4mm; }
.chip-row { display: flex; gap: 3mm; align-items: baseline; padding: 1.5mm 0; border-bottom: 1px dashed var(--line); break-inside: avoid; }
.chip { display: inline-block; flex: 0 0 auto; min-width: 26mm; text-align: center; border-radius: 10mm; padding: .7mm 2.4mm; font-size: 7.8pt; font-weight: 650; color: #fff; }
.c-grey { background: #8b877c; } .c-gold { background: var(--gold); } .c-green { background: var(--forest); } .c-red { background: var(--brick); } .c-char { background: var(--char); } .c-orange { background: var(--orange); }

/* two columns */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; margin-bottom: 3mm; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin-bottom: 3mm; }
.box { background: #f6f4ef; border-radius: 2.2mm; padding: 3mm 3.2mm; break-inside: avoid; }
.box .h { font-weight: 700; color: var(--char); margin-bottom: 1.2mm; font-size: 9.4pt; }
.box ul.b { margin: 0; } .box p { margin: 0; font-size: 8.8pt; color: #444; }
.stat { background: var(--char); color: var(--cream); border-radius: 2.2mm; padding: 3mm; break-inside: avoid; }
.stat .big { font-family: 'G'; font-size: 13pt; font-weight: 800; color: #fff; }
.stat .s { font-size: 7.8pt; color: #bdb8ab; }

/* app screen mock-ups */
.screen { border: 1.4mm solid var(--char); border-radius: 4mm; background: var(--app-bg); margin: 2mm auto 1.2mm; padding: 0; overflow: hidden; break-inside: avoid; }
.screen .bar { background: var(--char); color: #fff; font-size: 7pt; padding: .6mm 3mm 1.4mm; display: flex; justify-content: space-between; }
.screen .bar b { font-weight: 600; }
.screen .in { padding: 2.6mm; font-size: 7.8pt; line-height: 1.4; }
.cap { text-align: center; font-size: 7.6pt; color: var(--muted); margin: 0 0 3mm; font-style: italic; }
.m-h { font-weight: 700; font-size: 9pt; margin-bottom: 1.8mm; color: var(--ink); }
.m-card { background: var(--app-paper); border: 1px solid var(--app-line); border-radius: 1.8mm; padding: 2mm 2.4mm; margin-bottom: 1.8mm; }
.m-card.l-gold { border-left: 1mm solid var(--gold); } .m-card.l-green { border-left: 1mm solid var(--forest); } .m-card.l-grey { border-left: 1mm solid #9a9384; } .m-card.l-red { border-left: 1mm solid var(--brick); }
.m-meta { font-size: 6.8pt; color: #7c7461; margin-bottom: .8mm; display: flex; flex-wrap: wrap; gap: 1.4mm; align-items: center; }
.m-tag { background: rgba(60,94,66,.12); color: var(--forest); border-radius: 1mm; padding: 0 1.2mm; font-weight: 600; }
.m-dup { color: var(--brick); font-weight: 700; }
.m-btns { display: flex; gap: 1.2mm; flex-wrap: wrap; margin-top: 1.4mm; }
.m-btn { border: 1px solid var(--app-line); background: #fff; border-radius: 1.2mm; padding: .5mm 1.8mm; font-size: 6.8pt; color: var(--ink); }
.m-btn.p { background: var(--forest); color: #fff; border-color: var(--forest); }
.m-btn.g { background: var(--gold); color: #fff; border-color: var(--gold); }
.m-sel { display: inline-block; border: 1px solid var(--app-line); background: #fff; border-radius: 1.2mm; padding: .5mm 1.8mm; font-size: 6.8pt; color: #555; margin: 0 1mm 1mm 0; }
.m-tabs { display: flex; gap: 2.6mm; border-bottom: 1px solid var(--app-line); margin-bottom: 2mm; font-size: 7pt; color: #7c7461; }
.m-tabs span { padding-bottom: .8mm; }
.m-tabs .on { color: var(--ink); font-weight: 700; border-bottom: .6mm solid var(--forest); }
.m-badge { display: inline-block; border-radius: 3mm; color: #fff; font-size: 6pt; padding: 0 1.3mm; margin-left: .6mm; font-weight: 700; }
.m-opt { border: 1px solid var(--app-line); background: #fff; border-radius: 1.2mm; padding: .9mm 2mm; margin-bottom: 1mm; font-size: 7.2pt; }
.m-opt.on { border-color: var(--forest); background: rgba(60,94,66,.1); font-weight: 600; }
.m-photo { height: 13mm; border: 1px dashed #b9b09a; border-radius: 1.2mm; display: flex; align-items: center; justify-content: center; color: #7c7461; font-size: 7pt; background: #fff; margin-top: 1mm; }
.m-input { border: 1px solid var(--app-line); background: #fff; border-radius: 1.2mm; padding: .7mm 1.8mm; font-size: 6.8pt; color: #999; }
.call { display: inline-flex; align-items: center; justify-content: center; width: 3.8mm; height: 3.8mm; border-radius: 50%; background: var(--orange); color: #fff; font-size: 6pt; font-weight: 800; margin-left: .8mm; vertical-align: middle; }

/* contents */
.toc { margin-top: 2mm; }
.toc a { display: flex; align-items: baseline; gap: 2.4mm; padding: 0.7mm 0; border-bottom: 1px solid var(--line); font-size: 8.9pt; }
.toc .num { width: 6mm; color: var(--orange); font-weight: 700; font-size: 8.4pt; }
.toc .tt { flex: 1; color: var(--char); font-weight: 500; }
.toc .grp { font-size: 6.8pt; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; }
.toc .pg { width: 8mm; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.toc .newtag { background: var(--orange); color: #fff; font-size: 6pt; font-weight: 700; border-radius: 2px; padding: 0 1.2mm; margin-left: 1.5mm; letter-spacing: .06em; }
"""


def esc(s):
    return E(s, quote=True)


def bullets(items):
    return '<ul class="b">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'


def steps(items):
    out = []
    for n, (title, text) in enumerate(items, 1):
        out.append(f'<div class="step"><div class="n">{n}</div><div class="c"><span class="st">{title}</span>{text}</div></div>')
    return '<div class="steps">' + ''.join(out) + '</div>'


def note(title, body, kind=''):
    if isinstance(body, list):
        body = bullets(body)
    else:
        body = f'<p>{body}</p>'
    return f'<div class="note {kind}"><div class="h">{title}</div>{body}</div>'


def table(head, rows):
    th = ''.join(f'<th>{h}</th>' for h in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<table class="t"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def chips(rows):
    return '<div class="chips">' + ''.join(
        f'<div class="chip-row"><span class="chip {cls}">{label}</span><span>{desc}</span></div>' for label, cls, desc in rows) + '</div>'


def box(title, body):
    if isinstance(body, list):
        body = bullets(body)
    return f'<div class="box"><div class="h">{title}</div>{body}</div>'


def g2(*boxes):
    return '<div class="g2">' + ''.join(boxes) + '</div>'


def g3(*boxes):
    return '<div class="g3">' + ''.join(boxes) + '</div>'


def h3(t):
    return f'<h3>{t}</h3>'


def screen(inner, caption, title='My LIB', width='92mm'):
    return (f'<div class="screen" style="width:{width}"><div class="bar"><b>{title}</b><span>app.libeducation.com</span></div>'
            f'<div class="in">{inner}</div></div><div class="cap">{caption}</div>')


def call(n):
    return f'<span class="call">{n}</span>'


class Guide:
    def __init__(self, role, role_title, cover_sub):
        self.role, self.role_title, self.cover_sub = role, role_title, cover_sub
        self.sections = []   # (id, group, title, is_new, html)

    def add(self, sid, group, title, lead, body, new=False):
        self.sections.append((sid, group, title, new, lead, body))

    def html(self, pages=None, markers=True):
        pages = pages or {}
        toc = []
        for i, (sid, group, title, new, lead, body) in enumerate(self.sections, 1):
            toc.append(f'<a href="#{sid}"><span class="num">{i:02d}</span><span class="tt">{title}'
                       f'{"<span class=newtag>NEW</span>" if new else ""}</span><span class="grp">{group}</span>'
                       f'<span class="pg">{pages.get(sid, "")}</span></a>')
        secs = []
        for sid, group, title, new, lead, body in self.sections:
            mk = f'<span class="mk">@@{sid}@@</span>' if markers else ''
            k = f'{group}{"<span class=new>NEW</span>" if new else ""}'
            secs.append(f'<section class="section" id="{sid}">{mk}<div class="kicker"><span class="k">{k}</span>'
                        f'<a href="#contents">&#8593; Contents</a></div><h1 class="t">{title}</h1>'
                        f'<div class="rule"></div><p class="lead">{lead}</p>{body}</section>')
        c = CONTACT
        return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>My LIB {self.role_title} Guide</title>
<style>{CSS}</style></head><body>
<div class="cover"><img class="logo" src="logo.jpg" alt="LIB"><div class="slash"></div><div class="slash two"></div>
<div class="body"><div class="eyebrow">User guide</div><h1>Know Your<br>My LIB App</h1><div class="role">{self.role_title} guide</div>
<div class="sub">{self.cover_sub}</div></div>
<div class="foot"><span>{c['company']}</span><span>{EDITION}</span></div></div>
<section class="section" id="contents">{'<span class="mk">@@contents@@</span>' if markers else ''}<div class="kicker"><span class="k">Start here</span></div>
<h1 class="t">Contents</h1><div class="rule"></div><p class="lead">Tap any title to jump straight to it. Every page has a link back here.</p>
<div class="toc">{''.join(toc)}</div></section>
{''.join(secs)}
<div class="back"><div class="inner"><h2>Need help?</h2><div class="lead">We are one message away.</div>
<div class="row"><span>Phone / WhatsApp</span><span>{c['phone']}</span></div>
<div class="row"><span>Email</span><span>{c['email']}</span></div>
<div class="row"><span>Website</span><span>{c['web']}</span></div>
<div class="row"><span>The app</span><span>{c['app']}</span></div></div>
<img class="logo" src="logo.jpg" alt="LIB"><div class="addr">{c['company']}<br>{c['address']}</div></div>
</body></html>"""
