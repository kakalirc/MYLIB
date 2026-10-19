"""Teacher guide wording."""
from guide import Guide, steps, note, table, chips, box, g2, g3, h3, bullets, screen, call
import common


def guide():
    g = Guide('teacher', 'Teacher', 'Step-by-step help for teachers: classes, attendance, homework, '
              'the Question Bank, practice papers and your earnings.')
    common.getting_started(g, 'the admin or your colleagues')

    g.add('whatsnew', 'Start here', 'What’s new in this edition', 'The biggest additions since the last guide.', g2(
        box('Question Bank', 'Review questions taken from past CBSE board papers, fix them and approve them for use.'),
        box('Practice papers', 'Build a full board-style paper in one tap, assign it to students and download it as a PDF.'),
    ) + g2(
        box('Marking attempts', 'MCQs are marked for you. Mark the written answers, add feedback and the student sees the score straight away.'),
        box('Private homework photos', 'Homework photos and files now open through secure links that only signed-in users can use.'),
    ) + note('Where to find it', 'Everything new is in the <b>Question Bank</b> tab. Practice papers are its <b>Practice Papers</b> sub-tab.', 'tip'), new=True)

    g.add('portal', 'Overview', 'Your portal', 'Ten tabs. Everything is limited to your own classes and students.', table(
        ['Tab', 'What you do there'], [
            ['Dashboard', 'Today’s classes, earnings, alerts and AI tools'],
            ['Class Schedule', 'Create, run and export your timetable'],
            ['Study Plans', 'Topic roadmap for each student and subject'],
            ['Homework', 'Assign, track and review homework'],
            ['Question Bank', 'Review questions, build practice papers, mark attempts'],
            ['Availability', 'Weekly windows, leave and the free-slots report'],
            ['My Attendance Report', 'Your history and your students’ balances'],
            ['Give Attendance', 'Record the classes you have held'],
            ['My Profile', 'Contact details, bank and UPI, online class link, photo'],
            ['Setup', 'Change your password'],
        ]))

    g.add('dashboard', 'Overview', 'Dashboard', 'Everything you need at the start of the day.', g3(
        '<div class="stat"><div class="big">Given</div><div class="s">Classes given today</div></div>',
        '<div class="stat"><div class="big">Earned</div><div class="s">Earned this month so far</div></div>',
        '<div class="stat"><div class="big">Renew</div><div class="s">Students needing renewal</div></div>',
    ) + table(['Card', 'What it shows'], [
        ['Today’s classes', 'Time, student, subject, type and status'],
        ['My earnings', 'Hidden until you enter your password'],
        ['Month in review', 'Last month’s classes and earnings'],
        ['Student milestones', 'Alerts at 25, 50, 100 and 200 classes'],
        ['Low balance alert', 'Students down to their last few classes'],
        ['Not seen in a while', 'No class for 10 days or more'],
        ['My demo classes', 'Status and bonus earned'],
        ['Expiring soon', 'Classes about to lapse'],
        ['Study plans', '“X without a plan”: tap it to go straight to Study Plans'],
    ]))

    g.add('schedule', 'Classes', 'Class schedule', 'Plan your classes and mark them done.', h3('Create') + bullets([
        '<b>Weekly pattern:</b> pick days and times; it repeats until the subscribed count is filled.',
        'Every class is 60 minutes.',
        '<b>Extra class:</b> add a one-off class, for example a makeup.',
        'A schedule never goes beyond the classes the student has subscribed to.',
    ]) + h3('Run') + bullets([
        'Switch between <b>Today</b> and <b>By month</b>; filter by student and subject.',
        '<b>Mark done:</b> Present or Absent, count, mode and remarks.',
        'Edit the date and time, or undo. Export to Excel.',
    ]) + note('Rules', ['Individual students never share a slot.', 'You cannot schedule on your own leave days.',
                        'Students and parents see the schedule read-only.']))

    g.add('attendance', 'Classes', 'Give attendance and your report', 'Keep the register accurate.', h3('Give Attendance') + steps([
        ('Choose the class', 'Pick the student, subject, type and mode.'),
        ('Mark it', 'Present or Absent, with remarks if needed.'),
        ('Check the balance', 'The form shows how many classes that student has left.'),
    ]) + note('Watch out', ['The app warns you if the student has no classes left or the entry is a duplicate.',
                            'You can record the current month only. For earlier months, contact the admin.'], 'warn')
        + h3('My Attendance Report') + bullets([
            'Classes taught, by date, student and subject.',
            'Total present, absent and students taught.',
            'Subscription balances for every student mapped to you.',
        ]))

    g.add('availability', 'Classes', 'Availability, leave and free slots', 'Tell the centre when you can teach and when you cannot.', g3(
        box('Availability', ['Weekly windows for each day', 'Advisory only: classes can still be booked outside when needed']),
        box('Leave', ['From and to dates, with a reason', 'Blocks new scheduling in that window', 'Classes already booked stay as they are']),
        box('Free slots report', ['Free time inside your availability, after booked classes', 'For one day, or the month from today']),
    ))

    g.add('studyplans', 'Students', 'Study Plans', 'A topic roadmap for each student and subject.', steps([
        ('Open the plan', 'In the Study Plans tab (it opens in Report view), tap a student’s row, then pick the subject.'),
        ('Switch to edit', 'Tap <b>Edit</b>. Tap <b>+ Add topic</b> to add topics one at a time, with optional notes.'),
        ('Or let AI suggest topics', 'On an empty plan, tap <b>✨ Suggest topics</b>. Review the list, then save.'),
        ('Order and tidy', 'Drag the ☰ handle to reorder; tap ✕ to delete a topic.'),
        ('Save', 'Students and parents can see the plan straight away.'),
    ]) + h3('Topic status') + chips([
        ('Not started', 'c-grey', 'The default when a topic is created'),
        ('In progress', 'c-gold', 'Currently being covered'),
        ('Done', 'c-green', 'Topic completed'),
    ]) + note('Good to know', ['One plan per student per subject.', 'Filter the report by status, subject or student name.',
                               'Students and parents see the plan read-only.']))

    g.add('homework', 'Students', 'Homework: assigning', 'Tap <b>+ Add Homework</b> in the Homework tab.', steps([
        ('Choose student and subject', 'Pick any student mapped to you.'),
        ('Describe the work', 'Enter a title (required) and a description. The box is large, so give detailed instructions.'),
        ('Set the due date and Total Marks', 'For example 20: the student’s score will be out of this.'),
        ('Attach a file (optional)', 'Tap <b>Choose File</b> to add a PDF, image or document for the student.'),
        ('Link a Study Plan topic (optional)', 'Then tap Save.'),
    ]) + note('Editing', 'Tap <b>Edit</b> on any homework card to change it, whatever its status. The form reopens filled in.', 'tip'))

    g.add('homework2', 'Students', 'Homework: tracking and review', 'Filter the list to focus on what needs action.', chips([
        ('Assigned', 'c-grey', 'Waiting for the student to submit (the default view)'),
        ('Submitted', 'c-gold', 'The student has submitted: ready for your review'),
        ('Reviewed', 'c-green', 'You have given marks and feedback'),
        ('LATE', 'c-red', 'Past the due date; still shows under Assigned'),
    ]) + table(['Button', 'What it does'], [
        ['✓ Mark complete', 'For work done in class: moves Assigned to Submitted'],
        ['Mark reviewed', 'Enter marks and written feedback, then Save Review'],
        ['Reopen', 'Moves it back to Assigned if the student needs to redo it'],
        ['Remind', 'Opens WhatsApp with a reminder for assigned or late work'],
        ['WA (on Reviewed)', 'Sends the score and feedback by WhatsApp'],
        ['Delete', 'Removes the homework permanently'],
    ]) + note('Photos and files are private', 'Submitted photos and attached files open through secure links that only work for signed-in users. '
              'If a photo stops loading after you have had the app open for a few hours, tap Refresh.', 'tip'))

    # ---------------- Question Bank ----------------
    g.add('qb', 'Question Bank', 'The Question Bank', 'Questions taken from past board papers, checked by you before anyone uses them.', g3(
        box('Review Queue', 'New questions waiting for a teacher to check and approve.'),
        box('Full Question Bank', 'Every approved question you can use in papers.'),
        box('Practice Papers', 'Build papers, assign them and mark attempts.'),
    ) + h3('Finding questions') + steps([
        ('Choose Board, Subject and Grade', 'These three unlock everything else. You only see the subjects and classes you teach.'),
        ('Narrow it down', 'Filter by type (MCQ, Short, Long, Grammar, Unseen Passage and more), difficulty and <b>chapter</b>, or search the question text. <b>✕ Clear</b> starts again.'),
    ]) + screen(
        '<div class="m-h">Question Bank</div><div class="m-tabs"><span class="on">Review Queue <span class="m-badge" style="background:#a6432e">24</span></span>'
        '<span>Full Question Bank</span><span>Practice Papers</span></div>'
        '<span class="m-sel">CBSE</span><span class="m-sel">Sanskrit</span><span class="m-sel">Class 10</span>' + call(1) + '<br>'
        '<span class="m-sel">All types</span><span class="m-sel">All difficulties</span><span class="m-sel">Ch 3 · शिशुलालनम्</span>' + call(2)
        + '<span class="m-input">Search question text…</span>',
        '① Board, subject and class unlock the filters. ② Then narrow by type, difficulty, chapter or text.'), new=True)

    g.add('qbreview', 'Question Bank', 'Reviewing questions', 'You know your subject best: check each question before approving it.', screen(
        '<div class="m-card"><div class="m-meta"><input type="checkbox"> <b>Section B</b><span class="m-tag">Short</span><b>2 marks</b>'
        '<span style="color:#c99a3c;font-weight:700">medium</span><span>· Ch 3</span><span>· 2024</span><span class="m-dup">⚠ Already in bank</span>' + call(1) + '</div>'
        '<div>अधोलिखितं गद्यांशं पठित्वा प्रश्नानाम् उत्तराणि लिखत…</div>'
        '<div class="m-btns" style="justify-content:flex-end"><span class="m-btn">Show details</span><span class="m-btn p">✓ Approve</span>' + call(2)
        + '<span class="m-btn">Edit</span>' + call(3) + '</div></div>',
        '① Duplicate flag. ② Approve it. ③ Edit it first if something is wrong.') + steps([
        ('Open the details', 'Tap the question text or <b>Show details</b> to see the passage, answer and explanation.'),
        ('Fix anything wrong', 'Tap <b>Edit</b>: change the text, type, marks (half marks such as 1.5 are fine), difficulty, chapter or answer key. Tap Save.'),
        ('Approve', 'Tap <b>✓ Approve</b>. The question moves to the Full Question Bank and can be used in papers.'),
    ]), new=True)

    g.add('qbchapters', 'Question Bank', 'Chapters and duplicates', 'Keep the bank tidy so papers are balanced across chapters.', h3('Chapters') + bullets([
        'Every question should belong to a textbook chapter. <b>No chapter</b> in red means it isn’t linked yet.',
        'Choose <b>No chapter yet</b> in the chapter filter to find them.',
    ]) + steps([
        ('Tick the questions', 'Use the box at the top left of each question card.'),
        ('Choose the chapter', 'In the bar that appears above the list.'),
        ('Tap Set chapter', 'All ticked questions move to that chapter. <b>Remove chapter</b> clears it.'),
    ]) + h3('Duplicates') + chips([
        ('⚠ Duplicate', 'c-red', 'The same question appears more than once'),
        ('⚠ Already in bank', 'c-red', 'An approved copy already exists, so you can leave this one'),
    ]) + note('Tip', 'Tick <b>Duplicates only</b> next to the filters to see just the repeated questions.', 'tip'), new=True)

    g.add('papers', 'Question Bank', 'Building a practice paper', 'A full board-style paper, filled from the approved bank in one tap.', steps([
        ('Start a paper', 'In <b>Practice Papers</b>, tap <b>+ New paper</b>.'),
        ('Pick a blueprint', 'For example CBSE Class 10 Sanskrit, 80 marks. Each section shows its marks and how many questions the bank has.'),
        ('Title, time and chapters', 'Title and minutes are optional. Tick chapters to include; none ticked means all.'),
        ('Create and auto-fill', 'The app fills every section, balanced across chapters. If the bank runs short, the gap shows in red, '
                                 'for example “Section C: 12 of 15 marks”.'),
        ('Mark ready', 'When you’re happy, tap <b>Mark ready</b>: the paper changes from <b>Draft</b> to <b>Ready</b>. '
                        'Until it’s assigned you can still go <b>Back to draft</b> or <b>Delete paper</b>.'),
    ]) + h3('Adjust the questions') + table(['Button', 'What it does'], [
        ['Swap', 'Replace it with another approved question of the same type'],
        ['↑ ↓', 'Move it up or down'],
        ['Remove, + Add', 'Take one out, or add one to a section'],
        ['Re-run auto-fill', 'Fill the whole paper again'],
    ]), new=True)

    g.add('assign', 'Question Bank', 'Assigning and downloading papers', 'Send a ready paper to your students, or print it.', steps([
        ('Open the paper', 'Tap it in the Practice Papers list.'),
        ('Assign to students', 'Tap <b>Assign to students</b>. Students in the paper’s board, class and subject are listed first; '
                               'tick <b>Show my other students</b> to see the rest, with a ⚠ note saying why they don’t match.'),
        ('Set a due date', 'Then tap <b>Assign</b>. Students see it on their home screen straight away.'),
    ]) + note('Once assigned', ['The questions are fixed so every student gets the same paper.',
                                'You can remove a student until they start the paper.'], 'warn')
        + h3('Download as PDF') + bullets([
            '<b>⬇ Question paper PDF</b>: the paper as students would sit it.',
            '<b>⬇ With answer key</b>: the same paper with the answers.',
            'Both open a print view: choose <b>Save as PDF</b>, or print directly.',
        ]) + screen(
            '<div class="m-meta"><span class="m-tag" style="background:#3c5e42;color:#fff">Ready</span>Sanskrit · Class 10 · CBSE · <b style="color:#3c5e42">80 marks</b> · 38 questions</div>'
            '<div class="m-btns"><span class="m-btn">Back to draft</span><span class="m-btn p">Assign to students</span></div>'
            '<div class="m-tabs" style="margin-top:2mm"><span class="on">Students (6) <span class="m-badge" style="background:#c99a3c">2</span></span><span>Questions (38)</span>'
            '<span style="flex:1"></span><span>⬇ Question paper PDF</span><span>⬇ With answer key</span></div>',
            'A ready paper: assign it, then download it with or without answers.'), new=True)

    g.add('marking', 'Question Bank', 'Marking practice papers', 'MCQs are marked automatically. You mark the written answers.',
        '<p>A gold number on the <b>Practice Papers</b> tab shows how many papers are waiting. Open a paper, then its <b>Students</b> tab, '
        'and pick <b>Needs marking</b>.</p>' + steps([
        ('Tap Review', 'Next to a student who has submitted. Oldest submissions come first.'),
        ('Check MCQs', 'Already marked: you see the option picked and the correct one.'),
        ('Mark written answers', 'Read the typed answer or tap a photo to open it full size; <b>Model answer</b> is there if you need it. '
                                 'Enter <b>Marks</b> and an optional comment.'),
        ('Add overall feedback', 'What went well and what to revise.'),
        ('Finish', '<b>Mark as reviewed</b>, or <b>Mark as reviewed &amp; next</b> to go to the next student. '
                   '<b>Save marks for later</b> keeps your work without finishing.'),
    ]) + note('Good to know', ['Answers you leave unmarked count as 0; the app asks before you finish.',
                               'The student and parent see the score and feedback as soon as you mark it reviewed.',
                               'Reopen a reviewed paper with <b>View / edit marks</b> to change it.']), new=True)

    # ---------------- money and more ----------------
    g.add('earnings', 'Money', 'Earnings, salary slip and demos', 'See what you have earned, and when you were paid.', g2(
        box('My earnings', ['Hidden behind your password, and hidden again automatically',
                            'Base pay: classes taught × your rate', 'Plus demo bonus, plus or minus any adjustment with its note']),
        box('Payment status', ['Net payable for the month', 'Paid (with date and reference) or Pending', 'Printable salary slip']),
    ) + note('Your bank details', 'Enter your bank account, IFSC and UPI ID once in My Profile. After that only the admin can change them.')
        + h3('Demos and bonus: ₹100 for every demo student who joins') + chips([
        ('Pending', 'c-gold', 'Demo given, student not enrolled yet'),
        ('Converted', 'c-green', 'Student enrolled: ₹100 bonus earned'),
        ('Cancelled', 'c-grey', 'Demo did not go ahead: no bonus'),
    ]) + bullets([
        'You see your own demos: date, time, subject, board, status and bonus. Demo students’ contact details are not shown.',
        'The bonus is added to your payroll for the month the student joins.',
    ]))

    g.add('students', 'Students', 'Your students and AI tools', 'Notes, milestones, gentle nudges and help from AI.', g3(
        box('Student notes', ['Write a short note for a student', 'They see it on their home screen', 'AI can draft a progress note']),
        box('Milestones', ['Celebrates 25, 50, 100 and 200 classes with a student', 'Dismiss each card once seen']),
        box('Alerts', ['Students needing renewal', 'Low balance', 'Not seen for 10 days or more']),
    ) + h3('AI tools (when the admin turns AI on for you)') + table(['Tool', 'What it does'], [
        ['Monthly summary', 'A summary of your classes for the month'],
        ['Progress note', 'A draft note about one student'],
        ['Messages to parents', 'Absent follow-up or a parent update, drafted for you'],
        ['Ask AI', 'Questions about your own classes only; it never sees other teachers’ data'],
    ]))

    g.add('profile', 'Profile', 'Profile, chat and ID card', 'Everything personal in one place.', g2(
        box('My Profile', ['Mobile number, bank and UPI details', 'Online class link shown to your students', 'Photo from gallery or camera (up to 5 MB)']),
        box('Chat and help', ['Chat with the admin and colleagues', 'Notifications and announcements', 'Help and Support buttons']),
    ) + h3('Your Teacher ID card') + steps([
        ('Upload your photo', 'In My Profile. The card can’t be made without it.'),
        ('Tap ID Card', 'It shows the LIB logo, your photo and name, your Teacher ID code and the current academic year.'),
        ('Print or Save as PDF', 'Keep a copy on your phone.'),
    ]))

    g.add('quickref', 'Quick reference', 'Quick reference', 'I want to… where do I go?', table(['I want to…', 'Go to'], [
        ['Plan my classes', 'Class Schedule'],
        ['Record a class I held', 'Give Attendance'],
        ['Set leave', 'Availability'],
        ['Plan a student’s topics', 'Study Plans'],
        ['Set or review homework', 'Homework'],
        ['Check new questions', 'Question Bank › Review Queue'],
        ['Make a practice paper', 'Question Bank › Practice Papers › + New paper'],
        ['Print a paper or answer key', 'Open the paper › ⬇ Question paper PDF / With answer key'],
        ['Mark submitted papers', 'Practice Papers › paper › Students › Review'],
        ['See what I earned', 'Dashboard › My earnings'],
        ['Print my salary slip', 'My Attendance Report'],
        ['Update my bank details', 'My Profile'],
        ['Report a problem', 'Support button'],
    ]))
    return g
