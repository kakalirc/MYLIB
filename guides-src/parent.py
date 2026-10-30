"""Parent guide wording."""
from guide import Guide, steps, note, table, chips, box, g2, g3, h3, bullets
import common, practice


def guide():
    g = Guide('parent', 'Parent', 'Step-by-step help for parents: your child’s classes, homework, practice papers, '
              'study plans and fees.')
    common.getting_started(g, 'the admin or your child’s teacher')

    g.add('whatsnew', 'Start here', 'What’s new in this edition', 'The biggest additions since the last guide.', g2(
        box('One login per family', 'Your login ID is your 10-digit mobile number. All your children are under it.'),
        box('One fee message', 'The WhatsApp fee message lists every child’s classes and amount, the total, and how it was worked out.'),
    ) + g2(
        box('Pay online', 'Besides UPI, pay by card, UPI or net banking with <b>Pay online (Razorpay)</b>.'),
        box('Practice papers', 'Follow each board-style paper the teacher sets. MCQs are marked the moment your child submits.'),
    ), new=True)

    g.add('login', 'Start here', 'Your parent login', 'One login for the whole family.', steps([
        ('Get your details', 'LIB sends your login on WhatsApp. The login ID and first password are both your 10-digit mobile number.'),
        ('Sign in', 'At <b>app.libeducation.com</b>. All your children linked to you are under this one login.'),
        ('Change your password', 'Until you do, a red box asks you to. Tap <b>Change it now</b>, type the old password (your mobile) and a new one.'),
    ]) + note('Why change it?', 'Anyone who knows your mobile number could sign in with the first password.', 'warn')
        + note('A child missing?', 'Ask LIB on WhatsApp or Chat to link them to your login.', 'tip'), new=True)

    g.add('overview', 'Overview', 'What you see', 'One login, one or more children.', g3(
        box('Your child’s home', ['Classes remaining and attended this month', 'Pending fee requests', 'Classes expiring soon', 'Unread chats']),
        box('Several children?', ['Switch between them from the selector at the top', 'Each child’s information stays separate']),
        box('Teacher’s note and AI', ['The teacher’s short note, when written', 'An AI summary of your child’s progress']),
    ) + h3('Attendance and schedule') + g3(
        box('Attendance', ['Every class: date, subject, teacher, type, mode, status, remarks', 'Choose the month']),
        box('Class schedule', ['Upcoming and past classes with time and status', 'Join link for online classes']),
        box('Subscription report', ['Subscribed, used, expired and remaining for each subject', 'Full payment history']),
    ))

    g.add('studyplans', 'Learning', 'Study Plans', 'Your child’s topic roadmap, set by their teacher.', steps([
        ('Open Study Plans', 'From your child’s home screen or the menu.'),
        ('Pick a subject', 'Each subject has its own plan, with topics in the order the teacher set and any notes.'),
    ]) + h3('Topic status') + chips([
        ('Not started', 'c-grey', 'Coming up'),
        ('In progress', 'c-gold', 'Being covered now'),
        ('Done', 'c-green', 'Completed'),
    ]) + note('Good to know', ['Plans are made and updated by the teacher; you see them read-only.',
                               'No plan yet? The teacher hasn’t made one for that subject. Ask them on Chat.']))

    g.add('homework', 'Learning', 'Homework', 'Stay in the loop on your child’s homework.', g2(
        box('What you can see', ['Homework set by the teacher, with its due date and description', 'Files the teacher attached (worksheets, notes)',
                                 'A <b>LATE</b> notice if it wasn’t submitted on time', 'Marks and feedback once it’s reviewed']),
        box('WhatsApp messages', ['The teacher may send a reminder when homework is due or overdue',
                                  'After review, a summary with marks and feedback may be sent to your number',
                                  'These come from the teacher, not an automated system']),
    ) + note('Make sure we can reach you', 'Check your mobile number is saved in the app under your profile.', 'tip')
        + note('Photos are private', 'Your child’s homework photos open only for your family, the teacher and the centre. '
               'If one stops loading after the app has been open a few hours, tap Refresh.'))

    g.add('practice', 'Learning', 'Practice papers', 'Follow the board-style papers your child’s teacher sets.',
          practice.list_screen('View', 'Open a paper to see it') + h3('Paper status') + practice.statuses())

    g.add('practice2', 'Learning', 'Practice paper results', 'See how your child did, question by question.', steps([
        ('Find the paper', 'Practice Papers on your child’s home screen lists every paper, with the ones still to do at the top.'),
        ('Check the status', 'Submitted papers show the <b>MCQ score</b> straight away; written answers wait for the teacher.'),
        ('See the result', 'A <b>Reviewed</b> paper shows the total score and the teacher’s feedback. Tap <b>View</b> for the marks and comment on '
                           'every question and the model answers.'),
    ]) + note('Good to know', ['Only your child can answer the paper. Your view is read-only.',
                               'A paper marked <b>Overdue</b> has passed its due date without being submitted.',
                               'Questions about a mark? Message the teacher on Chat.']))

    g.add('resources', 'Learning', 'From your teachers', 'Study material the teachers share.', bullets([
        'Notes, worksheets, pictures and links the teachers shared for your child’s subjects.',
        'Tap an item to open or download it, for example to print a worksheet.',
        'The card appears once a teacher shares something.',
    ]) + note('Quick help in the app', 'Tap the small <b>?</b> next to a heading for help on that card.', 'tip'))

    g.add('fees', 'Fees', 'Fees, receipts and paying', 'Pay from your phone; the admin confirms.', bullets([
        'At the start of the month LIB sends one WhatsApp message for the family: each child’s subjects, classes and amount, the total, '
        'and a line on <b>how we worked it out</b> (for example, classes per week this month).',
        '<b>Fees due for your children</b> at the top of the page shows the total for every child.',
        '<b>Bulk discount:</b> all your children’s classes are added up. Pay all the fees due together to keep it; if only part is paid, the discount is worked out again on the classes paid for.',
    ]) + h3('Pay by UPI') + steps([
        ('Select and pay', 'In Fee Requests, tick what you are paying for and tap <b>Pay ₹…</b>.'),
        ('Pay by UPI', 'Copy the UPI ID (or scan the QR code on a computer) and put the <b>Unique ID</b> shown in your UPI app’s note.'),
        ('Payment done', 'Tap <b>Payment Completed</b>, then share the screenshot with LIB Admin. Once confirmed, it’s marked Paid with a receipt.'),
    ]) + h3('Or pay online') + bullets([
        'Tap <b>Pay online (Razorpay)</b> for card, UPI or net banking, and type the student’s name on the payment page.',
    ]) + note('Good to know', ['Every paid payment has a printable receipt with the LIB logo.',
                               'Pending requests don’t change the balance.', 'You can undo an attempt before it’s confirmed.']), new=True)

    g.add('ai', 'Help', 'AI, chat and help', 'Answers without waiting.', g3(
        box('Ask AI', ['How is my child doing?', 'Next month’s outlook', 'Subscription advice', 'Uses only your child’s data']),
        box('Chat', ['Message the admin or your child’s teacher', 'Attach files up to 5 MB']),
        box('Help and support', ['Help button for how-to answers', 'Support to report a problem', 'Change your password at the bottom of the page']),
    ) + h3('ID card and certificate') + g2(
        box('Student ID card', ['Your child prints it from their own login', 'Or ask the centre to send it']),
        box('Certificate of Achievement', ['Ask the admin on Chat, Support or WhatsApp', 'The admin sends you the PDF']),
    ) + note('Photo needed', 'Your child’s photo must be uploaded first: neither the ID card nor the certificate can be made without it.', 'warn'))

    g.add('quickref', 'Quick reference', 'Quick reference', 'I want to… where do I go?', table(['I want to…', 'Go to'], [
        ['See attendance', 'Attendance, by month'],
        ['See classes left', 'Stats and Subscription report'],
        ['See homework', 'Homework on the home screen'],
        ['See practice paper scores', 'Practice Papers › View'],
        ['See the study plan', 'Study Plans'],
        ['Find teachers’ notes', 'From your teachers card'],
        ['Pay fees', 'Fee Requests › Pay, or Pay online (Razorpay)'],
        ['Print a receipt', 'Payment history › Receipt'],
        ['Switch child', 'Selector at the top'],
        ['Report a problem', 'Support button'],
    ]))
    return g
