"""Practice-paper screens and statuses shared by the student and parent guides."""
from guide import chips, screen, call

STATUSES = [
    ('Not started', 'c-grey', 'Assigned and ready to start'),
    ('In progress', 'c-gold', 'Started; answers so far are saved'),
    ('Opens on…', 'c-grey', 'Locked until the date shown'),
    ('Overdue', 'c-red', 'Past the due date and not submitted yet'),
    ('Submitted', 'c-gold', 'Waiting for the teacher to mark the written answers'),
    ('Reviewed', 'c-green', 'Marked: score and feedback are ready'),
]


def statuses():
    return chips(STATUSES)


def list_screen(button='Continue', first='Start or carry on a paper'):
    return screen(
        '<div class="m-h">📝 Practice Papers</div><div class="m-meta">1 to do · 1 done</div>'
        '<div class="m-card l-gold"><b>Sanskrit Class 10 practice paper</b><div class="m-meta">Sanskrit · 80 marks · 180 min · due 25 Oct</div>'
        f'<div class="m-btns" style="align-items:center"><span style="color:#c99a3c;font-weight:700;font-size:6.8pt">✏️ In progress</span><span class="m-btn p">{button}</span>{call(1)}</div></div>'
        '<div class="m-card l-green"><b>Unit test: Chapters 1–3</b><div class="m-meta">Sanskrit · 40 marks</div>'
        '<div style="color:#3c5e42;font-size:7.2pt">⭐ Score: <b>34 / 40</b>' + call(2) + '</div>'
        '<div style="font-size:6.8pt;margin-top:.8mm;background:rgba(60,94,66,.08);padding:.8mm 1.6mm;border-left:.6mm solid #3c5e42">💬 Well done. Revise the grammar section.</div>'
        '<div class="m-btns"><span style="color:#3c5e42;font-weight:700;font-size:6.8pt">✅ Reviewed</span><span class="m-btn">View</span></div></div>',
        f'① {first}. ② The score and the teacher’s feedback once it’s marked.')


def paper_screen():
    return screen(
        '<div class="m-h">Sanskrit Class 10 practice paper</div><div class="m-meta">12 of 38 answered · Answers save automatically</div>'
        '<div class="m-tabs"><span>Section A ✓</span><span class="on">Section B</span><span>Section C</span><span>Section D</span>' + call(1) + '</div>' +
        '<div class="m-card"><div class="m-meta"><b>Q14</b><b>1 mark</b><span style="color:#3c5e42">· answered</span></div>'
        'उचितम् उत्तरं चिनुत।<div class="m-opt on" style="background:#c99a3c;color:#fff;border-color:#c99a3c">(b) … ' + call(2) + '</div></div>'
        '<div class="m-card"><div class="m-meta"><b>Q15</b><b>5 marks</b></div>पत्रं लिखत…'
        '<div class="m-btns"><span class="m-btn g">📷 Add photo of your answer</span>' + call(3) + '</div>'
        '</div><div class="m-btns" style="justify-content:space-between"><span class="m-btn">← Previous section</span><span class="m-btn p">Next section →</span></div>',
        '① Sections (✓ when all answered). ② Tap an option. ③ Photograph written work.')
