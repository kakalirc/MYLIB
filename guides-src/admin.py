"""Admin guide wording."""
from guide import Guide, steps, note, table, chips, box, g2, g3, h3, bullets
import common


def guide():
    g = Guide('admin', 'Admin', 'Step-by-step help for admins: the daily register, demos, fees and fee requests, '
              'payroll, students, teachers, parents and settings.')
    common.getting_started(g, 'teachers, students and parents')

    g.add('menu', 'Overview', 'The admin menu', 'The menu on the left (☰ menu at the top on a phone) is in groups.', table(
        ['Group', 'Pages'], [
            ['Dashboard', 'Stats, classes expiring, demo funnel, AI students at risk'],
            ['Daily work', 'Class Log, New registrations, Communication, Demo Bookings, Support, Rebuild Pending Classes'],
            ['Money', 'Fees, Payroll, Expenses, Reports &amp; Export'],
            ['People', 'Students &amp; Subscriptions, Teachers &amp; Subjects, Parents'],
            ['Teaching', 'Study Plans, Homework, Question Bank'],
            ['System', 'Settings, Manage Admins, AI, Audit Log'],
            ['Superadmin', 'Superuser admins only: Academic Year, backups, danger zone'],
        ]) + note('Quick help everywhere', 'Tap <b>?</b> next to a heading for help on that card. The <b>? Help</b> button at the top '
                  'has the Quick Guide and the Help bot.', 'tip') + note('Links you can share', 'Each page has its own address, for example '
                  '<b>…/#fees</b> or <b>…/#setup</b>, so a bookmark opens that page.'))

    g.add('monthly', 'Overview', 'Your month at a glance', 'The jobs that come round every month.', table(['When', 'Job', 'Where'], [
        ['Every day', 'Log classes, answer chats and support, follow up demos and new registrations', 'Class Log, New registrations, Communication, Support, Demo Bookings'],
        ['1st to 7th', 'Raise the month’s fee requests and send fee messages', 'Fees › Raise fee requests'],
        ['As payments come', 'Confirm Razorpay payments, mark requests paid', 'Fees'],
        ['Any time', 'Send a Short reminder to families still due', 'Fees › Pending fee requests › Message'],
        ['Month end', 'Check payroll, mark teachers paid, print salary slips', 'Payroll'],
        ['Month end', 'Add expenses, check net profit', 'Expenses, Reports'],
        ['When timetables change', 'Update Class Frequency, rebuild the schedule', 'Teachers &amp; Subjects, Rebuild'],
    ]))

    # ---------------- Daily work ----------------
    g.add('classlog', 'Daily work', 'Class Log', 'Record a class on a teacher’s behalf.', steps([
        ('Pick the date and teacher', 'Search by name, ID or mobile, then tap the teacher.'),
        ('Fill in the class', 'Student, subject, Group / Individual, Online / Offline, Present or Absent, number of classes and remarks.'),
        ('Log class', 'The student’s classes left show before you save, with a warning if they have none.'),
    ]) + note('Absent uses a class', 'Absent counts like Present: it uses one of the student’s classes.', 'warn') + h3('The register') + bullets([
        'Below the form: the teacher’s classes for the <b>Selected day</b> or the <b>Whole month</b>, with a month total.',
        'Dates show the weekday, for example <b>Tue, 27 Oct 2026</b>.',
    ]))

    g.add('registrations', 'Daily work', 'New registrations', 'Families register online; you decide who becomes a student.', steps([
        ('Share the link', '<b>app.libeducation.com/register.html</b> (also on the login screen). On the page: 📋 Copy link, or type a mobile and 📤 Send link on WhatsApp.'),
        ('Check the form', 'New forms show here, with a count on the menu and Dashboard. ⚑ flags: mobile already a family, had a demo, several forms. 📞 Call or 💬 WhatsApp to confirm.'),
        ('Accept', 'Correct name, grade, board, mode, type and academic year, then <b>Add student</b>. Same mobile as a family: add as brother/sister.'),
        ('Send the logins', 'Accept makes the parent login (mobile) and student login (student code). Send both with the 📤 buttons.'),
    ]) + bullets([
        'Subjects are not enrolled for you: open the student and enrol them with a teacher. The form\'s subjects, school and message show on the student\'s page; <b>View original form</b> shows it all as sent.',
        '<b>Reject</b> (Reopen undoes it) or tick forms and <b>Archive</b>. Nothing is deleted: <b>Show archived</b> brings them back.',
    ]) + note('Junk is blocked', 'Bots are stopped, at most 3 forms per mobile and 30 a day in total, and nothing becomes a student until you Accept.', 'tip'))

    g.add('demos', 'Daily work', 'Demo Bookings', 'Demo bookings from the website, from first call to admission.', chips([
        ('New', 'c-red', 'Just booked: call the family, then Confirm a teacher and time'),
        ('Scheduled', 'c-char', 'Mark done after the demo, Mark lost, Reschedule or Cancel'),
        ('Done', 'c-gold', 'Demo given: Convert to Student, or Mark lost'),
        ('Converted', 'c-green', 'Student record made; the teacher gets a ₹100 bonus'),
        ('Lost', 'c-grey', 'Did not join (with an optional reason); Reopen brings it back'),
    ]) + bullets([
        '<b>Paid / Not paid:</b> a Razorpay payment for a demo marks the booking Paid by itself. One the app could not match '
        'shows at the top: pick the booking, or <b>Not a demo</b>.',
        '<b>Convert to Student</b> fills a new student record from the booking; <b>→ Open student record</b> takes you there.',
    ]) + h3('Demo Register') + bullets([
        'Every demo a teacher gave. Teachers mark their own demos Done from their Dashboard.',
        'You can set any status, add a Lost reason, or go straight from Pending to Converted with <b>Link &amp; Convert</b>.',
        '<b>Demo results</b> shows each teacher’s demos, Converted % and why demos were lost.',
    ]))

    g.add('comms', 'Daily work', 'Communication and Support', 'Talk to everyone, and fix what they report.', g2(
        box('Chat', ['<b>New message</b>: one-to-one with a teacher, student or parent', '<b>New group</b>: several people at once',
                     'Unread counts on the menu and the 💬 button']),
        box('Announcements', ['A notice above the menu bar', 'For everyone, a whole role or one person',
                              'Stays until dismissed, expired or deleted']),
    ) + h3('Support Inbox') + bullets([
        'Problems reported with the Support button by teachers, students and parents.',
        'Filter by Open, In Progress, Resolved or All. Reply and change the status; the person sees both.',
    ]))

    g.add('rebuild', 'Daily work', 'Rebuild Pending Classes', 'A fresh schedule of upcoming classes from Class Frequency.', steps([
        ('Choose the scope', 'All active students, or one student.'),
        ('Preview Rebuild', 'Shows per student and subject: classes left, future Pending classes to remove, overdue classes kept, weekly frequency.'),
        ('Rebuild', 'Removes only future Pending classes and makes new ones. Subscription limits and teacher clashes are still checked.'),
    ]) + note('What stays', ['Done classes, overdue Pending classes and other statuses are never touched.',
                             'Students with no Class Frequency are skipped and listed.']) + h3('Placeholder times') + bullets([
        'New classes get <b>00:00</b> (Group) or <b>01:00 / 02:00</b> (Individual).',
        'Teachers see them under <b>Class timings to correct</b> in Pending Action Items and put in the real time.',
    ]))

    # ---------------- Money ----------------
    g.add('fees', 'Money', 'Fees page', 'Prices, renewals and every payment in one place.', table(['Card', 'What it does'], [
        ['Students needing renewal', 'Zero or negative balances, and enrolled students who never paid'],
        ['Razorpay payments to confirm', 'Fee payments from the Razorpay page, each with a suggested family'],
        ['Pending fee requests', 'Every unpaid request, grouped by family'],
        ['Raise fee requests', 'The month’s requests for every student in one go'],
        ['Fee Message Settings', 'UPI ID, QR code and contact number used in fee messages'],
        ['All subscription payments', 'Every payment for a student or everyone, by month'],
        ['Fee setup', 'Per-class rates by category, Group / Individual and Online / Offline'],
        ['Discount structure', 'Discount tiers by number of classes'],
        ['Fee calculator', 'Works out a fee and can push it as a fee request'],
    ]) + note('Rates', 'A student’s <b>Special fee rate</b> (on their page) replaces Fee setup wherever their fee is worked out. '
              'A missing rate means a request can’t be raised.', 'tip'))

    g.add('raise', 'Money', 'Raise fee requests', 'One run at the start of each month.', steps([
        ('Pick the Target Month', 'Then tap <b>Preview Fee Requests</b>. Preview works any day and saves nothing.'),
        ('Check the preview', 'Grouped by family, each row with classes, amount and its working. Change classes or amount, or untick a row.'),
        ('Look at Not raised', 'Who was left out and why: a request already pending, enough classes left, no rate, archived.'),
        ('Confirm', 'Only on the <b>1st to 7th</b> of the month, once a month. <b>Reset</b> removes the run so you can do it again.'),
    ]) + h3('How the classes are worked out') + bullets([
        '<b>Class Frequency:</b> each saved weekday counted in the month, minus clearly cancelled teacher-leave classes.',
        '<b>Classes left:</b> paid minus used (Absent counts as used). Owed classes are shown separately.',
        '<b>Packages:</b> a last payment of 30, 50, 60 or 100 classes asks for the same package again.',
        '<b>Amount:</b> rate × classes, less the bulk discount: the best tier reached by the request, the child’s subjects added up, or the whole family added up. Tick <b>No discount</b> on a row or family for this run only.',
    ]) + note('Keep a copy', '<b>Download Excel</b> saves the whole run.', 'tip'))

    g.add('feemsg', 'Money', 'Fee messages and getting paid', 'One message per family; confirm each payment.', h3('Send the message') + steps([
        ('Tap Message', 'On any pending request. It makes one message for the whole family.'),
        ('Check the text', 'Each child’s subjects, classes and amount, the total, how it was worked out, UPI and Razorpay details and the parent login.'),
        ('Send it', 'On a phone the WhatsApp button opens the app. On a computer: <b>📤 Desktop</b> (WhatsApp app) or <b>📤 Web</b>.'),
    ]) + bullets([
        'Tick <b>Short reminder</b> for a follow-up: only the opening line changes to “gentle reminder … still due”.',
        'Sending records the date, so you can see when the family was last reminded and how many times.',
        'Brothers and sisters are one family when they share a parent login or mobile. Tick <b>Bill separately</b> on a student to keep them out.',
    ]) + h3('Mark it paid') + bullets([
        '<b>Mark paid</b> for one request, <b>Mark all paid</b> for the whole family with one date and reference. Type the <b>Amount received</b>.',
        '<b>Part payment</b> (less than due, or only some of a family’s discounted requests): the discount is worked out again on the classes paid for, the rest becomes a new pending request, extra money goes in Remarks. You confirm first.',
        '<b>No bulk discount</b> on a student’s page switches the discount off for the whole family.',
        '<b>Razorpay payments to confirm:</b> check the suggested family and <b>Confirm</b>; wrong family? Pick another. <b>Not a fee</b> sets it aside.',
    ]))

    g.add('payroll', 'Money', 'Payroll, expenses and reports', 'What you pay out, and what is left.', g2(
        box('Payroll', ['Classes × the teacher’s rate, plus ₹100 for each Converted demo', 'Adjustments with a note, Mark paid',
                        '📄 Salary Slip, or 📄 Print all salary slips']),
        box('Expenses', ['Rent, electricity, internet and so on', 'Not teacher pay: payroll is counted separately']),
    ) + h3('Reports &amp; Export') + table(['Report', 'Shows'], [
        ['Student report, balances', 'Classes and balances per student'],
        ['Net profit', 'Fee collection minus payroll and expenses'],
        ['Classes per teacher, register', 'Each teacher’s classes for the month'],
        ['Razorpay payments', 'Every Razorpay payment for the month, fee or demo'],
        ['Refunds, Excel export', 'Refunds issued; download the data'],
    ]))

    g.add('students', 'People', 'Students &amp; Subscriptions', 'Everything about one student on one page.', table(['Section', 'What you do there'], [
        ['Details', 'Contact details, grade, category, board, parents’ numbers'],
        ['Subject enrollment', 'Add or remove subjects; needed before payments and classes'],
        ['Subscription balances', 'Subscribed, used and left per subject and type'],
        ['Fee requests', 'Raise one (Calculate fills it), Message, Mark paid'],
        ['Record payment', 'Classes bought; the amount fills in from the rates'],
        ['Refund, Transfer', 'Refund unused classes, or move them to another subject'],
        ['Subscription history', 'Active, upcoming and expired payments, with receipts'],
        ['Special fee rates', 'An agreed per-class rate for this student, with dates'],
        ['Notes, attendance', 'Private teacher notes and the full attendance record'],
    ]) + note('Special fee rates', ['Set subject, Group / Individual, rate (and an Offline rate if different), from and until.',
                                    'Used everywhere this student’s fee is worked out. Discount tiers still apply.',
                                    'Saved requests and payments don’t change.']))

    g.add('teachers', 'People', 'Teachers, subjects and Class Frequency', 'Who teaches what, and how often each student comes.', bullets([
        '<b>Teachers &amp; Subjects:</b> add teachers and subjects and set which teacher teaches each subject.',
        'Transfer a student or all of a departing teacher’s students to another teacher.',
    ]) + h3('Class Frequency') + steps([
        ('Open it', 'The <b>Class Frequency</b> button at the top of Teachers &amp; Subjects.'),
        ('+ New Frequency or Edit', 'Pick the student and subject, tick the weekdays and set the classes on each day (60 minutes each).'),
        ('Fill the gaps', 'Pairs that are <b>Not configured</b> are listed; teachers can set their own students too.'),
    ]) + note('Used by', ['Raise fee requests, to count the month’s classes.', 'Rebuild Pending Classes, to make the schedule.',
                          'Saving it never changes classes already scheduled.']))

    g.add('parents', 'People', 'Parents', 'One parent login per family.', steps([
        ('Create all parent logins', 'Preview lists every family without a login. Nothing is saved until you press Create.'),
        ('Login details', 'Login ID and first password are the parent’s 10-digit mobile. Brothers and sisters share one login.'),
        ('Send them', '<b>📤 WhatsApp</b> sends each family its login. You can resend from the parent’s page.'),
    ]) + bullets([
        '<b>Manage parent logins:</b> search by mobile, parent or child, then link or unlink children.',
        'Parents are asked to change the password after their first login.',
    ]))

    # ---------------- Teaching and system ----------------
    g.add('teaching', 'Teaching', 'Study Plans, Homework and Question Bank', 'Follow what teachers set.', g3(
        box('Study Plans', ['Read-only view of every plan and progress', 'Textbook library: rename, retag or delete books']),
        box('Homework', ['Every homework set by every teacher', 'Filter by teacher, student or status']),
        box('Question Bank', ['Review Queue, Full Question Bank, Archived', 'Practice Papers and Past Papers']),
    ) + note('Teacher access', 'Teachers see the Question Bank and Research tabs only when you switch them on in Settings.', 'tip'))

    g.add('settings', 'System', 'Settings, admins, AI and audit', 'How the app is set up.', table(['Page', 'What is there'], [
        ['Settings', 'Grades, categories, boards, subject names; Question Bank access and Research access per teacher; Star Teacher switch, start date and leaderboard; add users; change your password'],
        ['Manage Admins', 'Add or remove admin accounts'],
        ['AI', 'Master switch, AI access per role and per person, AI usage and estimated cost'],
        ['Audit Log', 'Every change made in the app, login activity and App usage (who uses which feature)'],
    ]) + h3('Superadmin tools') + bullets([
        'Only superuser admins see this menu. Each card opens with the unlock password.',
        '<b>Academic Year:</b> <b>Advance everyone</b> sets the new year and moves every student (except Adult) up a grade. '
        '<b>Set year only</b> and <b>Fill blank student years</b> never change grades.',
        '<b>Export all data</b> and <b>Import backup</b>.',
        '<b>Danger zone:</b> remove old Audit and Login entries, clear all data, audit logging on or off.',
    ]) + note('Cannot be undone', 'Export a backup before any danger-zone action.', 'warn'))

    g.add('quickref', 'Quick reference', 'Quick reference', 'I want to… where do I go?', table(['I want to…', 'Go to'], [
        ['Log a class', 'Class Log'],
        ['Register a new student', 'New registrations (send the form link)'],
        ['Book or follow up a demo', 'Demo Bookings'],
        ['Raise this month’s fees', 'Fees › Raise fee requests'],
        ['Send a fee message or reminder', 'Fees › Pending fee requests › Message'],
        ['Confirm a Razorpay payment', 'Fees › Razorpay payments to confirm'],
        ['Record a payment', 'Students › student › Record payment'],
        ['Give a student a special rate', 'Students › student › Special fee rates'],
        ['Set weekly classes', 'Teachers &amp; Subjects › Class Frequency'],
        ['Rebuild the schedule', 'Rebuild Pending Classes'],
        ['Make parent logins', 'Parents › Create all parent logins'],
        ['Pay teachers', 'Payroll'],
        ['See profit', 'Reports › Net profit'],
        ['Turn on QB or Research', 'Settings'],
        ['Turn AI on or off', 'AI'],
    ]))
    return g
