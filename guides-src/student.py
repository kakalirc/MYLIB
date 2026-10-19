"""Student guide wording."""
from guide import Guide, steps, note, table, chips, box, g2, g3, h3, bullets
import common, practice


def guide():
    g = Guide('student', 'Student', 'Step-by-step help for students: your classes, homework, practice papers, '
              'fees, XP and badges.')
    common.getting_started(g, 'your teacher or the admin')

    g.add('whatsnew', 'Start here', 'What’s new in this edition', 'The biggest additions since the last guide.', g2(
        box('Practice papers', 'Your teacher can now set full board-style papers. Do them section by section on your phone.'),
        box('Instant MCQ marks', 'Multiple-choice questions are marked the moment you submit.'),
    ) + g2(
        box('Photo answers', 'Write long answers on paper and send a photo, just like homework.'),
        box('Private photos', 'Your homework and answer photos are private: only you, your parent, your teacher and the centre can open them.'),
    ) + note('Where to find it', 'Practice papers appear on your home screen as soon as your teacher assigns one.', 'tip'), new=True)

    g.add('home', 'Home', 'Your home screen', 'Top to bottom, what you will see.', table(['Card', 'What it shows'], [
        ['Welcome and theme', 'A greeting, your subjects and 6 colour themes'],
        ['Badges and XP level', 'A progress bar to your next level'],
        ['Stats', 'Classes remaining, attended this month, fee requests, unread chats'],
        ['Streak and milestones', 'Classes in a row and celebration cards'],
        ['Last month’s recap', 'Classes attended, by subject'],
        ['Low-balance nudge', 'A warning when classes run low'],
        ['Today’s class', 'Time, subject and teacher'],
        ['Teacher’s note', 'A short note when your teacher writes one'],
        ['Study plan, homework, practice papers', 'What your teacher has set for you'],
        ['Leaderboard', 'Overall and by subject'],
    ]))

    g.add('xp', 'Grow', 'XP, levels, badges and streaks', 'You earn 1 XP for every class you attend.', table(['Level', 'XP'], [
        ['Beginner', '0 to 99'], ['Explorer', '100 to 249'], ['Rising Star', '250 to 499'],
        ['Pro', '500 to 999'], ['Champion', '1,000 to 1,999'], ['Legend', '2,000 and above'],
    ]) + h3('Six badges, earned from your attendance') + g2(
        box('Attendance', ['<b>Century Club:</b> 100 classes', '<b>Gold Student:</b> 50 classes', '<b>Veteran:</b> attending for 180+ days']),
        box('Habits', ['<b>All-Rounder:</b> 2 or more subjects', '<b>Perfect Month:</b> no absence, 8+ classes',
                       '<b>Consistent:</b> 8+ classes in each of the last 2 months']),
    ) + note('Streaks and milestones', 'Your streak counts classes in a row. Celebration cards appear at 10, 25, 50, 100, 200 and 500 classes; '
             'dismiss each one once seen.', 'tip'))

    g.add('leaderboard', 'Grow', 'Leaderboard and themes', 'Make it competitive, make it yours.', g2(
        box('Leaderboard', ['Overall, plus a tab for each of your subjects', 'Top 3 on the podium',
                            'Your own rank shows even outside the top 3', 'Monthly; last month shows if this month is empty']),
        box('Themes', ['Pick one of 6 accent colours from the dots on the welcome banner', 'Saved for you on this device']),
    ))

    g.add('classes', 'Classes', 'Classes, schedule and balance', 'Know where you stand.', g2(
        box('Attendance', ['Every class by month: date, subject, teacher, type, mode, status and remarks']),
        box('Classes remaining', ['Subscribed, used, expired and remaining for each subject and type',
                                  'A warning when classes are about to expire']),
    ) + g2(
        box('Class schedule', ['Your classes by month: time, done, overdue and upcoming']),
        box('Online classes', ['Your teacher’s join link, one tap away']),
    ))

    g.add('studyplans', 'Learn', 'Study Plans', 'The topic roadmap your teacher has set for you.', bullets([
        'One plan per subject, set by your teacher. Find it on your home screen or in the menu.',
        'Topics are listed in the order your teacher chose, with any notes they added.',
    ]) + h3('Topic status') + chips([
        ('Not started', 'c-grey', 'Coming up'),
        ('In progress', 'c-gold', 'Being covered in class now'),
        ('Done', 'c-green', 'Completed'),
    ]) + note('Good to know', ['Only your teacher can change the plan.',
                               'No plan for a subject yet? Your teacher hasn’t made one. Ask them on Chat.']))

    g.add('homework', 'Learn', 'Homework', 'See what’s been set, submit your work and check your score.', steps([
        ('Open Homework', 'Each card shows the subject, title, due date and status. A <b>LATE</b> badge means it’s past the due date. '
                          'Tap a card for the full description and any file your teacher attached.'),
        ('Submit your work', 'Tap <b>Submit</b>, then take a photo of your work or choose one from your gallery. '
                             'The status changes to <b>Submitted</b> and your teacher is told.'),
        ('See your score', 'Once your teacher reviews it, the card shows your marks (for example 17 / 20) and their written feedback.'),
    ]) + note('Your photos are private', 'Only you, your parent, your teacher and the centre can open them. If a photo stops loading after the app '
              'has been open a few hours, tap Refresh.', 'tip'))

    g.add('practice', 'Learn', 'Practice papers', 'Board-style papers your teacher sets, done on your phone.',
          practice.list_screen() + h3('Paper status') + practice.statuses(), new=True)

    g.add('practice2', 'Learn', 'Doing a practice paper', 'Work through it section by section. Nothing is lost if you stop.',
          practice.paper_screen() + steps([
              ('Tap Start or Continue', 'Continue picks up where you left off.'),
              ('Answer each question', '<b>MCQ:</b> tap your choice. <b>Short answers:</b> type in Sanskrit or English. '
                                       '<b>Long answers, letters and translations:</b> write on paper and tap <b>📷 Add photo of your answer</b>.'),
              ('Move on, then submit', 'Use <b>Next section →</b>; answers save automatically. On the last section tap <b>Submit paper</b>. '
                                       'The app warns you about any unanswered questions.'),
          ]), new=True)

    g.add('practice3', 'Learn', 'Your practice paper results', 'MCQs are marked instantly; your teacher marks the rest.', bullets([
        'After you submit you can’t change your answers. Your <b>MCQ score</b> shows straight away.',
        'Once your teacher has marked the written answers, the paper shows <b>Reviewed</b> with your total score and their feedback.',
        'Tap <b>View</b> to see the marks and comment for every question, the correct MCQ option and the <b>model answer</b>.',
    ]) + note('Tips for a good score', ['Read the passage carefully before the questions under it.',
                                         'Make photos clear and well lit, one page at a time. Tap ✕ to remove a bad photo and try again.',
                                         'Check the due date: papers past it show <b>Overdue</b>.'], 'tip'), new=True)

    g.add('fees', 'Pay', 'Paying your fees', 'Pay from your own login; the admin confirms.', steps([
        ('See your requests', 'Fee Requests lists each request with its classes and amount.'),
        ('Select and pay', 'Tick what you are paying for and tap <b>Pay</b>.'),
        ('Pay by UPI', 'Copy the UPI ID and put the unique ID in the payment note.'),
        ('Payment done', 'Tap <b>Completed</b>, then share the screenshot with LIB Admin.'),
        ('Admin confirms', 'It’s marked Paid and the classes are added.'),
    ]) + note('Good to know', ['Pending requests don’t count until they’re paid.', 'You can cancel an attempt before it’s confirmed.',
                               'Payment history shows each reference and remark, with a printable receipt.']))

    g.add('ai', 'Help', 'Ask AI, profile and chat', 'Claude helps you understand your own progress.', g3(
        box('How am I doing?', ['A friendly summary of your month']),
        box('Plan ahead', ['Next month forecast', 'Subscription advice']),
        box('Ask AI', ['Anything about your own classes and balance', 'Uses only your own data']),
    ) + g2(
        box('My details', ['Parent name and mobile numbers: enter once, then only the admin can change them',
                           'Set your academic year', 'Change your password at the bottom of the page']),
        box('Chat and support', ['Chat with your teacher or the admin', 'Help button for how-to answers', 'Support to report a problem']),
    ))

    g.add('idcard', 'Help', 'ID card and certificate', 'Upload your photo first: neither can be made without it.', h3('Student ID card') + steps([
        ('Upload your photo', 'From your home screen, using the gallery or camera (up to 5 MB).'),
        ('Tap ID Card', 'It shows the LIB logo, your photo and name, your Student ID code and the current academic year.'),
        ('Print or Save as PDF', 'Keep a copy on your phone.'),
    ]) + h3('Certificate of Achievement') + bullets([
        'Shows the LIB logo, your name and photo, grade, academic year, the LIB Seal of Trust and a reference number.',
        'Ask the admin on Chat, Support or WhatsApp. They’ll send you the PDF.',
    ]))

    g.add('quickref', 'Quick reference', 'Quick reference', 'I want to… where do I go?', table(['I want to…', 'Go to'], [
        ['See classes left', 'Stats at the top of the home screen'],
        ['See today’s class', 'Today’s class card'],
        ['Do a practice paper', 'Practice Papers on the home screen › Start'],
        ['See my practice score', 'Practice Papers › Reviewed paper › View'],
        ['Submit homework', 'Homework › Submit'],
        ['See my study plan', 'Study Plans'],
        ['Pay my fees', 'Fee Requests › Pay'],
        ['Print a receipt', 'Payment history › Receipt'],
        ['Check my level', 'XP card'],
        ['Change colours', 'Theme dots on the welcome banner'],
        ['Report a problem', 'Support button'],
    ]))
    return g
