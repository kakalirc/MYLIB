/* MY LIB Help & Search — local, zero-AI-cost navigation and task finder. */
(function () {
  'use strict';
  if (window.__libHelpSearchInstalled) return;
  window.__libHelpSearchInstalled = true;

  const TASKS = [
    { key: 'fees', title: 'Raise or send a fee request', terms: ['fee request', 'fee requests', 'raise fee', 'send fee', 'collect fees', 'request payment', 'payment reminder'], roles: ['Admin'], help: 'Open Fees, then use the Raise fee requests area. The existing Fee requests help explains the calculation, payment status and family WhatsApp message.' },
    { key: 'log', title: 'Mark or review class attendance', terms: ['attendance', 'mark attendance', 'class attendance', 'take attendance', 'class log', 'classes held'], roles: ['Admin'], help: 'Open Class Log to work with scheduled classes and attendance records.' },
    { key: 'registrations', title: 'Find a prospect or new registration', terms: ['prospect', 'prospects', 'new registration', 'registrations', 'admission', 'enquiry', 'enquiry'], roles: ['Admin'], help: 'Open New registrations to find and review incoming registration records.' },
    { key: 'onboarding', title: 'Student onboarding and communication', terms: ['student login', 'parent login', 'create login', 'login details', 'reset password', 'student password', 'parent password', 'onboarding'], roles: ['Admin'], help: 'Open Student Onboarding & Communication for the available onboarding and communication workflows.' },
    { key: 'students', title: 'Find a student or subscription', terms: ['student details', 'subscription', 'subscriptions', 'class balance', 'remaining classes', 'student record'], roles: ['Admin'], help: 'Open Students & Subscriptions to find student records and subscription information.' },
    { key: 'parents', title: 'Find parent details', terms: ['parent details', 'parent record', 'family details'], roles: ['Admin'], help: 'Open Parents to find parent records.' },
    { key: 'payroll', title: 'View teacher payroll', terms: ['teacher salary', 'salary', 'payroll', 'teacher payment'], roles: ['Admin'], help: 'Open Payroll to review teacher payment calculations.' },
    { key: 'reports', title: 'View or export reports', terms: ['report', 'reports', 'export', 'excel', 'download report'], roles: ['Admin'], help: 'Open Reports & Export to access the available reporting and export tools.' },
    { key: 'questionbank', title: 'Open the Question Bank', terms: ['question bank', 'questions', 'question paper', 'papers', 'exam questions'], roles: ['Admin'], help: 'Open Question Bank to work with the question and paper library.' },
    { key: 'academics', title: 'Open My Learning', terms: ['my learning', 'attendance', 'classes', 'class schedule', 'subscription', 'learning'], roles: ['Student'], help: 'Open My Learning to view your classes, attendance and subscription details.' },
    { key: 'fun', title: 'Open Fun Zone', terms: ['fun zone', 'games', 'daily challenges', 'brain teasers', 'knowledge arena'], roles: ['Student'], help: 'Open Fun Zone to access Knowledge Arena games and challenges.' },
    { key: 'settings', title: 'Open Account Settings', terms: ['account settings', 'change password', 'password', 'profile settings'], roles: ['Student'], help: 'Open Settings to manage your account and change your password.' },

    // Teacher portal help topics. These map to the real Teacher tab keys in index.html.
    { key: 'dashboard', title: 'View earnings or download my salary slip', terms: ['salary slip', 'payslip', 'pay slip', 'earnings', 'my salary', 'teacher salary', 'payment received', 'paid status', 'demo bonus'], roles: ['Teacher'], help: 'On your Dashboard, find Earnings and unlock it with your password. It shows classes × your rate, demo bonuses, adjustments and paid status. The Salary Slip button appears once payment is marked paid.' },
    { key: 'dashboard', title: 'Review students needing renewal', terms: ['students needing renewal', 'low class balance', 'zero balance', 'renewal students'], roles: ['Teacher'], help: 'The Dashboard shows students whose remaining classes have reached zero, or who have not subscribed to a subject you teach.' },
    { key: 'dashboard', title: 'Review my demo classes and bonus', terms: ['my demo classes', 'demo bonus', 'demo bonus earned'], roles: ['Teacher'], help: 'The Dashboard lists your demo classes and any converted-demo bonus included in monthly earnings.' },
    { key: 'dashboard', title: 'Find or add a student note', terms: ['student notes', 'add student note', 'search student notes'], roles: ['Teacher'], help: 'Use Student Notes on your Dashboard to find a student and add or review the note saved to your account.' },
    { key: 'dashboard', title: 'View my daily teaching dashboard', terms: ['dashboard', 'today classes', 'today s classes', 'student notes', 'low balance', 'renewal', 'demo classes'], roles: ['Teacher'], help: 'Your Dashboard shows today’s classes, students needing renewal, low balances, students not seen recently, demo classes and student notes.' },
    { key: 'pendingactions', title: 'Review pending action items', terms: ['pending action', 'pending tasks', 'what should i do', 'tasks waiting', 'overdue', 'to do list', 'action items'], roles: ['Teacher'], help: 'Pending Action Items collects work waiting for you: overdue classes, timings to correct, missing Class Frequency, demos to mark done, homework or papers to review, missing study plans, unread chats and availability.' },
    { key: 'starteacher', title: 'View Star Teacher points and badges', terms: ['star teacher', 'points', 'badges', 'trophy', 'leaderboard', 'levels', 'earn points'], roles: ['Teacher'], help: 'Star Teacher is a monthly points game when enabled by the office. Open it to see your points, level, badges and activities that can earn points.' },
    { key: 'schedule', title: 'Manage my class schedule', terms: ['class schedule', 'weekly schedule', 'timetable', 'extra class', 'class time', 'reschedule', 'remove pending class', 'placeholder time'], roles: ['Teacher'], help: 'Class Schedule shows your classes by day or month. You can set up a weekly schedule, add an extra class, mark a class done or remove a pending class. Replace placeholder times such as 00:00, 01:00 or 02:00 with the real time.' },
    { key: 'frequency', title: 'Update class frequency for a student', terms: ['class frequency setup', 'class frequency', 'classes per week', 'weekday classes', 'weekly classes', 'frequency setup'], roles: ['Teacher'], help: 'Class Frequency Setup records how many classes each student has on each weekday, per subject. The office uses it for monthly fees and the class schedule.' },
    { key: 'myfrequency', title: 'View my students’ class frequency', terms: ['my students class frequency', 'class frequency report', 'student frequency'], roles: ['Teacher'], help: 'My Students Class Frequency lets you review the class frequency records for your students.' },
    { key: 'students', title: 'Find a student and check class balance', terms: ['find a student', 'student details', 'student contact', 'class balance', 'classes remaining', 'subscription balance', 'new subscription', 'renewal student'], roles: ['Teacher'], help: 'My Students lists contact details, subjects and class balances (subscribed, used, left and next expiry) for students enrolled in your subjects. Use its search box to find a student.' },
    { key: 'studyplans', title: 'Create or update a student study plan', terms: ['study plan', 'study plans', 'lesson plan', 'topics', 'topic list', 'textbook', 'extract topics', 'export study plan'], roles: ['Teacher'], help: 'Study Plans lets you create a topic list per student and subject, update topic progress, export a plan as PDF, or add topics from a textbook linked from the shared library.' },
    { key: 'homework', title: 'Assign homework or review submissions', terms: ['homework', 'assign homework', 'homework submission', 'review homework', 'mark reviewed', 'marks', 'feedback', 'due date'], roles: ['Teacher'], help: 'Homework lets you assign work with a title, subject, due date, optional study-plan topic and attachment. Review student submissions, give marks and feedback, then mark them reviewed.' },
    { key: 'questionbank', title: 'Use Question Bank and practice papers', terms: ['question bank', 'questions', 'question paper', 'practice paper', 'practice papers', 'past papers', 'mark paper', 'marking', 'review questions', 'approve questions'], roles: ['Teacher'], help: 'Question Bank includes the Review Queue, Full Question Bank, Archived, Practice Papers and Past Papers. You can create and assign practice papers, then mark written answers and review submissions. Availability depends on your access.' },
    { key: 'research', title: 'Prepare lessons and share teaching resources', terms: ['research', 'lesson prep', 'lesson preparation', 'ai brief', 'chapter brief', 'resource library', 'worksheet', 'share resources', 'student insights', 'question research'], roles: ['Teacher'], help: 'Research includes lesson preparation briefs, saved briefs, a resource library for notes, worksheets and links, student insights and question research. This tab appears only when Research access is enabled.' },
    { key: 'attendance', title: 'Give attendance for a class', terms: ['give attendance', 'mark attendance', 'record attendance', 'class attended', 'attendance entry', 'attendance marking'], roles: ['Teacher'], help: 'Give Attendance records a class you taught. Records for the current month can be edited; earlier months are view-only.' },
    { key: 'report', title: 'View my attendance report', terms: ['my attendance report', 'attendance report', 'classes taught', 'monthly attendance', 'attendance by student'], roles: ['Teacher'], help: 'My Attendance Report shows your classes for the month, grouped by student.' },
    { key: 'availability', title: 'Set my availability and leave dates', terms: ['availability', 'available hours', 'teaching hours', 'leave', 'leave dates', 'free slots', 'weekly availability'], roles: ['Teacher'], help: 'Availability lets you set your weekly teaching hours and leave dates, and view a free-slots report.' },
    { key: 'knowledgearena', title: 'Play Knowledge Arena', terms: ['knowledge arena', 'games', 'daily challenge', 'quiz', 'game'], roles: ['Teacher'], help: 'Knowledge Arena provides grade-appropriate games for Teachers. Selecting a temporary grade for player mode does not change your teacher record.' },
    { key: 'profile', title: 'View or update my teacher profile', terms: ['my profile', 'teacher profile', 'profile details', 'online class link'], roles: ['Teacher'], help: 'My Profile shows your details and online class link.' },
    { key: 'appraisalframework', title: 'View my appraisal framework', terms: ['appraisal', 'appraisal framework', 'performance criteria'], roles: ['Teacher'], help: 'My Appraisal Framework shows the appraisal framework available to you, when access has been enabled.' },
    { key: 'setup', title: 'Change my account password', terms: ['change password', 'reset password', 'account password', 'login password'], roles: ['Teacher'], help: 'Open Setup in the Account group to change your password.' },
    { key: 'demoanalysis', title: 'Review my demo analysis', terms: ['demo analysis', 'demo classes', 'demo conversion', 'demo outcomes', 'assigned demos'], roles: ['Teacher'], help: 'My Demo Analysis shows assigned demos, period totals, completed, converted, pending and lost outcomes, conversion rate and subject conversion.' },
    { key: 'classdelivery', title: 'Review class delivery performance', terms: ['class delivery', 'delivery intelligence', 'overdue classes', 'conducted classes', 'delivery rate', 'attendance rate', 'class trend'], roles: ['Teacher'], help: 'Class Delivery Intelligence shows scheduled, conducted, absent, pending and overdue classes, delivery and attendance rates, a 14-day trend and teacher/student breakdowns.' },
    { key: 'teacherperformance', title: 'Review my teaching performance', terms: ['teacher performance', 'performance intelligence', 'workload', 'subject workload', 'six month trend', 'student engagement'], roles: ['Teacher'], help: 'Teacher Performance Intelligence is a read-only view of your workload, students, subject workload, six-month delivery and attendance trends, student engagement and overdue classes.' },
    { key: 'chat', title: 'Chat with Admin or another user', terms: ['chat', 'message admin', 'send message', 'communication'], help: 'Use the Chat button in the top bar to message Admin and other users.', roles: ['Teacher'], helpOnly: true },
    { key: 'support', title: 'Report an issue or request support', terms: ['support', 'report an issue', 'problem', 'bug', 'something wrong'], help: 'Use the Support button in the top bar if something looks wrong.', roles: ['Teacher'], helpOnly: true },

    // Admin guide topics
    { key: 'dashboard', title: 'Review the Admin Dashboard', terms: ['admin dashboard','centre overview','classes expiring','demo funnel','students at risk','stats'], help: 'Start on the Dashboard for centre statistics, classes expiring, the demo funnel and student-risk indicators. Open the source page to verify an individual record.', roles: ['Admin'], helpOnly: true },
    { key: 'monthly', title: 'Plan the monthly admin work', terms: ['monthly checklist','month end','monthly routine','month start','what should admin do'], help: 'Daily: log classes, answer chats and support, follow up demos and registrations. From the 1st–7th: raise fee requests. As payments arrive: confirm them. At month end: check payroll, mark teachers paid, print salary slips, add expenses and review net profit. Update Class Frequency when timetables change.', roles: ['Admin'], helpOnly: true },
    { key: 'classlog', title: 'Record a class in Class Log', terms: ['class log','log a class','record class','absent class','present class','classes held'], help: 'Choose the date and teacher, then enter student, subject, Group/Individual, Online/Offline, Present/Absent, number of classes and remarks. Absent counts as a used class, just like Present.', roles: ['Admin'], helpOnly: true },
    { key: 'registrations', title: 'Review new registrations and create logins', terms: ['new registration','admission form','accept registration','reject registration','student login','parent login','send login','registration whatsapp'], help: 'Open New registrations. Review the form and confirm the family, correct the student details, then Add student. Accepting creates the parent login (mobile number) and student login (student code); send both login details using the page actions. Subjects still need to be enrolled separately.', roles: ['Admin'], helpOnly: true },
    { key: 'demos', title: 'Manage demo bookings and conversions', terms: ['demo booking','schedule demo','confirm demo','reschedule demo','cancel demo','mark demo done','convert demo','demo lost','demo register'], help: 'Open Demo Bookings to follow a booking from New to Scheduled, Done, Converted or Lost. Confirm a teacher and time, mark the demo done, then Convert to Student or Mark lost. Demo Register shows teacher demos and conversion results.', roles: ['Admin'], helpOnly: true },
    { key: 'comms', title: 'Use Communication, Chat and Support Inbox', terms: ['communication','chat with parent','chat with student','chat with teacher','announcement','support inbox','reply to support','support ticket'], help: 'Communication supports one-to-one and group messages and announcements for everyone, a role or one person. Support Inbox collects issues raised by teachers, students and parents; filter by status, reply and update the status.', roles: ['Admin'], helpOnly: true },
    { key: 'rebuild', title: 'Rebuild pending classes and schedules', terms: ['rebuild classes','rebuild schedule','pending classes','class frequency schedule','new subscription schedule','missing classes','placeholder times'], help: 'Open Rebuild Pending Classes. Preview the scope and proposed changes first. Rebuild removes only future Pending classes and creates new ones; Done classes, overdue Pending classes and other statuses remain untouched. New placeholder times must be corrected by the teacher.', roles: ['Admin'], helpOnly: true },
    { key: 'fees', title: 'Review students needing renewal', terms: ['students needing renewal', 'zero balance students', 'renewal list'], roles: ['Admin'], help: 'Open the Students needing renewal section on the Fees page to review students with zero or negative class balance, or no subscription.' },
    { key: 'fees', title: 'Review pending fee requests', terms: ['pending fee requests', 'requests waiting payment', 'unpaid fee requests'], roles: ['Admin'], help: 'Open Pending fee requests on the Fees page to review requests waiting to be marked Paid.' },
    { key: 'fees', title: 'Use the fee calculator', terms: ['fee calculator', 'calculate tuition fee', 'calculate student fees'], roles: ['Admin'], help: 'Use Fee calculator on the Fees page to calculate the amount for a student and subject using the configured rate and discount structure.' },
    { key: 'fees', title: 'Manage fee requests and payments', terms: ['fee requests','raise fees','fee calculator','pending fee requests','mark fee paid','part payment','razorpay payment','upi payment','bulk discount','fee message'], help: 'The Fees page covers students needing renewal, Razorpay payments to confirm, pending requests, monthly fee-request generation, fee-message settings, subscription payments, fee setup, discounts and the fee calculator. Preview fee requests before confirming; confirm only during the 1st–7th of the month.', roles: ['Admin'], helpOnly: true },
    { key: 'payroll', title: 'Process teacher payroll and salary slips', terms: ['payroll','teacher salary','salary slip','payslip','mark teacher paid','demo bonus','payroll adjustment','teacher payment'], help: 'Payroll calculates classes × the teacher’s configured rate, plus converted-demo bonuses and any adjustment. Review the month, record adjustments with a note, mark payment and print an individual or all salary slips.', roles: ['Admin'], helpOnly: true },
    { key: 'expenses', title: 'Record expenses and review net profit', terms: ['expenses','rent','electricity','internet bill','net profit','profit calculation'], help: 'Use Expenses for operating costs such as rent, electricity and internet. Reports calculate net profit as fee collection minus teacher payroll and expenses; payroll is counted separately from general expenses.', roles: ['Admin'], helpOnly: true },
    { key: 'reports', title: 'Run reports and export data', terms: ['reports','export excel','student balances','classes per teacher','razorpay report','refund report','net profit report'], help: 'Reports & Export includes student reports and balances, net profit, classes per teacher and register, Razorpay payments, refunds and Excel exports. Select the relevant filters before exporting.', roles: ['Admin'], helpOnly: true },
    { key: 'students', title: 'Manage student records and subscriptions', terms: ['student record','student profile','enrol subject','subscription balance','record payment','refund classes','transfer classes','special fee rate','student attendance history','student notes'], help: 'Students & Subscriptions contains student details, subject enrolment, balances, fee requests, payments, refunds and transfers, subscription history, special fee rates, notes, attendance and call logs.', roles: ['Admin'], helpOnly: true },
    { key: 'teachers', title: 'Manage teachers, subjects and class frequency', terms: ['teachers','subjects','assign teacher','transfer students','class frequency','weekly frequency','timetable setup'], help: 'Teachers & Subjects is where you add teachers and subjects, assign teachers to subjects, transfer students and configure Class Frequency by student, subject and weekday. Class Frequency feeds fee calculations and schedule generation.', roles: ['Admin'], helpOnly: true },
    { key: 'parents', title: 'Manage parent accounts and family links', terms: ['parents','parent account','parent login','family login','link child','unlink child','parent mobile','resend parent login'], help: 'Parents provides one login per family. Preview families without a login before creating accounts. The login ID and first password are the parent’s 10-digit mobile number. Search by mobile, parent or child to link or unlink children, and resend login details when needed.', roles: ['Admin'], helpOnly: true },
    { key: 'teaching', title: 'Monitor Study Plans, Homework and Question Bank', terms: ['study plans monitoring','homework monitoring','question bank monitoring','teacher homework','review study plans'], help: 'The Teaching and Teacher Monitoring areas provide read-only views of teacher study plans and student progress, homework assigned by teachers, Question Bank review queues, practice papers and past papers. Use the teacher/student workflows to make corrections.', roles: ['Admin'], helpOnly: true },
    { key: 'monitoring', title: 'Review Teacher Monitoring tools', terms: ['teacher monitoring','research monitoring','app usage','ai usage','star teacher monitoring','teacher activity'], help: 'Teacher Monitoring includes Star Teacher, Research Monitoring, App Usage, AI Usage, Study Plans, Homework, Question Bank Monitoring and Teacher Appraisal. These are monitoring views; correct source records in their normal workflows.', roles: ['Admin'], helpOnly: true },
    { key: 'analytics', title: 'Review centre analytics and performance', terms: ['analytics','demo analysis','class delivery intelligence','student engagement','revenue intelligence','teacher performance intelligence'], help: 'Analytics includes Demo Analysis, Class Delivery Intelligence, Student Engagement Intelligence, Revenue Intelligence and Teacher Performance Intelligence. Use the relevant report to review trends, delivery, engagement and revenue.', roles: ['Admin'], helpOnly: true },
    { key: 'settings', title: 'Manage system settings, admins and audit log', terms: ['settings','manage admins','add admin','ai settings','api settings','audit log','academic year','backup','danger zone'], help: 'System includes Settings, Manage Admins, AI controls and Audit Log. Superadmin-only tools such as Academic Year, backups and the danger zone are restricted to authorised superusers.', roles: ['Admin'], helpOnly: true },

    // Student guide topics
    { key: 'academics', title: 'Understand my Student home screen', terms: ['home screen','my dashboard','today class','teacher note','classes remaining','low balance','unread chats','monthly recap'], help: 'Your My Learning home screen shows your subjects, XP level, class and attendance stats, streaks, milestones, last month’s recap, low-balance alerts, today’s class, teacher notes, study plans, homework, practice papers, shared resources and leaderboard.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Check my attendance and class history', terms: ['my attendance','attendance percentage','absent classes','pending overdue','attendance details','attendance history'], help: 'My Attendance shows overall and subject-wise Present, Absent and Pending Overdue records. Choose a month or All time, then open View attendance details for date, subject, teacher, class type and status. Future Pending classes are excluded from the attendance percentage.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Check my class schedule and remaining balance', terms: ['classes left','class balance','class schedule','next class','online class link','classes remaining','subscription balance'], help: 'The Classes area shows attendance, classes remaining by subject and type, expiry warnings, your monthly schedule and the teacher’s online-class join link.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'View my Study Plans', terms: ['study plan','topic roadmap','topics not started','topics in progress','completed topics'], help: 'Study Plans show the topic roadmap for each subject, including Not started, In progress and Done topics. Your teacher creates and updates the plan; ask them on Chat if a subject has no plan yet.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Submit homework and check marks', terms: ['homework','submit homework','upload homework','homework photo','homework due date','homework marks','teacher feedback','late homework'], help: 'Open Homework, choose an assignment and read its description and attachments. Tap Submit to take a photo or choose one from your gallery. After your teacher reviews it, you can see your marks and written feedback.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Complete a practice paper and view results', terms: ['practice paper','exam paper','start paper','continue paper','submit paper','mcq score','paper results','model answers'], help: 'Open Practice Papers to Start or Continue a paper. Answers save as you move between sections. Submit when finished; MCQs are marked immediately, while written answers wait for teacher review. Reviewed papers show the total score, question-wise marks and feedback.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Find notes and worksheets from my teachers', terms: ['from your teachers','shared resources','worksheet','study material','teacher notes','download notes','shared links'], help: 'From your teachers contains notes, worksheets, pictures and links shared for your subjects. Tap an item to open or download it.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Pay my fees and download receipts', terms: ['fees','fee request','pay fees','upi payment','razorpay','online payment','payment history','receipt'], help: 'Fee Requests lists the amount and classes due. You can pay by UPI using the displayed Unique ID or use Pay online (Razorpay) for card, UPI or net banking. After Admin confirms payment, classes are added; Payment history provides printable receipts.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Understand my XP, levels, badges and streak', terms: ['xp','points','level','badges','streak','attendance rewards','leaderboard','theme colours'], help: 'You earn attendance XP for each class attended. Your home screen shows levels, badges, streaks, milestones and the overall or subject leaderboard. Theme colours can be changed from the welcome banner.', roles: ['Student'], helpOnly: true },
    { key: 'fun', title: 'Play Knowledge Arena and daily challenges', terms: ['knowledge arena','fun zone','daily challenge','games','brain teasers','game xp','game leaderboard','memory challenge'], help: 'Fun Zone opens Knowledge Arena for grade-matched games, daily challenges, achievements and a separate Game XP system. Game XP and game achievements are separate from attendance XP and attendance rewards.', roles: ['Student'], helpOnly: true },
    { key: 'settings', title: 'Change my password or account settings', terms: ['change password','reset password','profile details','student settings','account settings'], help: 'Open Settings to change your password and manage the personal settings available to your Student account.', roles: ['Student'], helpOnly: true },
    { key: 'academics', title: 'Ask for help, chat or get my ID card', terms: ['ask ai','chat','message teacher','message admin','support','report problem','id card','certificate'], help: 'Use Chat to contact your teacher or Admin, Support to report a problem, and the Help button for how-to answers. Upload your photo before creating your Student ID card. Ask Admin for a Certificate of Achievement.', roles: ['Student'], helpOnly: true },

    // Parent guide topics
    { key: 'parenthome', title: 'Use Parent Login and switch between children', terms: ['parent login','switch child','viewing selector','multiple children','family account','child missing','link child'], help: 'One Parent login covers the family. Use the Viewing selector at the top to switch between linked children. Each child’s learning, attendance and fee information stays separate. If a child is missing, contact LIB Admin to link them to your family login.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Review my child’s attendance and schedule', terms: ['child attendance','attendance history','class schedule','upcoming classes','past classes','online class link','classes remaining'], help: 'Choose your child in the Viewing selector. Review attendance by month, class schedule, class status and online-class join links. The Subscription report shows subscribed, used, expired and remaining classes by subject.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Follow my child’s Study Plans', terms: ['child study plan','study plans','topic progress','topics done','learning progress'], help: 'Study Plans show the topic roadmap set by your child’s teacher, with Not started, In progress and Done statuses. Parent access is read-only; the teacher makes changes.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Check homework, due dates and teacher feedback', terms: ['child homework','homework status','homework due date','late homework','homework marks','teacher feedback','submitted homework'], help: 'Homework shows assignments, due dates, descriptions, teacher attachments, late status, marks and feedback after review. Teachers may send WhatsApp reminders and review summaries.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'View practice papers and results', terms: ['practice papers','child exam results','paper score','mcq score','reviewed paper','model answers'], help: 'Practice Papers lists the papers set by your child’s teacher. Submitted papers show the MCQ score; after teacher review, you can see the total score, feedback, question-wise marks and model answers. Only the child can answer papers.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Open notes and resources shared by teachers', terms: ['from your teachers','shared resources','worksheets','teacher notes','study material','download worksheet'], help: 'From your teachers contains notes, worksheets, pictures and links shared for your child’s subjects. Open or download items from the child’s home screen.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Pay family fees and download receipts', terms: ['fees','fee requests','pay fees','bulk discount','upi payment','razorpay','online payment','payment history','receipt'], help: 'The family fee view shows amounts due for each child and the total. Pay selected requests by UPI or Pay online (Razorpay). Paying all family fees together preserves the bulk discount; partial payment recalculates it. Payment history provides printable receipts.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Understand my child’s home screen and progress', terms: ['parent dashboard','child home screen','classes remaining','low balance','expiring classes','teacher note','ai summary','unread chats'], help: 'The child’s home screen shows classes remaining and attended, pending fee requests, classes expiring soon, unread chats, teacher notes and an AI progress summary when available.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Use Chat, AI, Help and Support', terms: ['chat','message teacher','message admin','ask ai','support','report a problem','help'], help: 'Use Chat to message Admin or your child’s teacher, Help for how-to answers, and Support to report a problem. Ask AI uses only the selected child’s data.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Understand Knowledge Arena parent access', terms: ['knowledge arena','games','daily challenge','game xp','parent view'], help: 'Knowledge Arena games and challenges are completed by the child in their own Student Login. Parent Login can view progress but cannot submit answers on the child’s behalf.', roles: ['Parent'], helpOnly: true },
    { key: 'parenthome', title: 'Help with parent login and password', terms: ['forgot password','parent password','first password','mobile login','change parent password'], help: 'The Parent login ID and first password are the family’s 10-digit mobile number. Change the password after the first login. If the password is lost or a child is missing from the account, contact LIB Admin.', roles: ['Parent'], helpOnly: true }
    ,
    { key: 'help', title: 'Find help for a task anywhere in MY LIB', terms: ['how to','help','guide','instructions','where do i','how do i','find feature','search help'], help: 'Use Help & Search in the app header. Describe the task in everyday words or search by feature name. Suggestions are filtered for your login role; choose a result to open its section when that destination is available.', roles: ['Admin','Teacher','Student','Parent'], helpOnly: true },
    { key: 'help', title: 'Understand the difference between Help, Chat and Support', terms: ['help vs support','chat or support','report issue','contact admin','ask question','problem report'], help: 'Help & Search explains how to use the app. Chat is for a conversation with the people available to your role. Support is for reporting a problem that needs attention; keep the report factual and include the screen or task where it happened. Never include your password.', roles: ['Admin','Teacher','Student','Parent'], helpOnly: true },
    { key: 'help', title: 'A menu or action is missing', terms: ['missing menu','cannot see menu','no option','feature missing','permission','access denied','not showing'], help: 'MY LIB shows options according to your login role and account permissions. First confirm you are signed in to the correct account. If the option should be available, contact your Admin or LIB Support and mention your role, the screen and the action you expected.', roles: ['Admin','Teacher','Student','Parent'], helpOnly: true },
    { key: 'help', title: 'A page or action is not working', terms: ['page not loading','button not working','error message','screen stuck','not responding','refresh app','technical issue'], help: 'Note the exact error text and the page where it appeared. If safe, reload the page and try once more. Do not repeat a payment or other action that may have already succeeded. If it continues, report it through Support with the time, screen and steps that led to the issue.', roles: ['Admin','Teacher','Student','Parent'], helpOnly: true },
    { key: 'help', title: 'Keep my account and password safe', terms: ['password safety','forgot password','login issue','account security','share password','reset login'], help: 'Never share your password in Chat, Support or a screenshot. If you cannot sign in or need a reset, contact LIB through the official phone or WhatsApp details in your role guide. Change any temporary password after signing in.', roles: ['Admin','Teacher','Student','Parent'], helpOnly: true }

  ];

  const QUICK_BY_ROLE = {
    Admin: ['Raise fee requests', 'Review new registrations', 'Process teacher payroll'],
    Student: ['Check my classes', 'Submit homework', 'Pay my fees'],
    Teacher: ['View my classes', 'Mark attendance', 'Find a student'],
    Parent: ['Switch between children', 'Check homework', 'Pay family fees']
  };

  function getRole() {
    try { if (typeof currentRole !== 'undefined' && currentRole) return String(currentRole); } catch (e) {}
    const topbar = document.querySelector('#app .topbar');
    const text = topbar ? (topbar.textContent || '') : '';
    const match = text.match(/\((Admin|Teacher|Student|Parent)\)/i);
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : '';
  }

  function tasksForRole() {
    const role = getRole();
    if (!role) return [];
    return TASKS.filter(task => Array.isArray(task.roles) && task.roles.includes(role));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normal(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function isVisibleInCurrentPortal(node) {
    if (!node || node.hidden || node.getAttribute("aria-hidden") === "true") return false;
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    let current = node;
    while (current && current !== document.body) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle ? window.getComputedStyle(current) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      current = current.parentElement;
    }
    return true;
  }
  function getNavItems() {
    const role = getRole();
    let selector = '';
    if (role === 'Student') selector = '.student-portal-section-switcher [onclick*="setStudentPortalSection("]';
    else if (role === 'Teacher') selector = '#app [onclick]';
    else if (role === 'Parent') selector = '.parent-sidebar .sidebar-item[onclick], .parent-portal [onclick]';
    else selector = '.sidebar-nav .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick]';
    const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisibleInCurrentPortal);
    const found = new Map();
    nodes.forEach(node => {
      const handler = node.getAttribute('onclick') || '';
      let match = handler.match(/setTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setTeacherPortalTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setStudentPortalSection\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/set[A-Za-z0-9_]*(?:Tab|Section)\(['"]([^'"]+)['"]\)/);
      if (!match) return;
      const key = match[1];
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (key && label && !found.has(key)) found.set(key, { key, label, handler });
    });
    return Array.from(found.values());
  }
  // Explicit in-page destinations for sections with stable IDs in the app.
  function findHelpSectionTarget(target) {
    if (!target) return null;
    if (target === 'raise-fees') {
      return Array.from(document.querySelectorAll('#app h2'))
        .find(node => (node.textContent || '').trim().startsWith('Raise fee requests —')) || null;
    }
    if (target.startsWith('text:')) {
      const wanted = normal(target.slice(5));
      const headings = Array.from(document.querySelectorAll('#app h1, #app h2, #app h3, #app h4, #app summary, #app [role="heading"]'))
        .filter(isVisibleInCurrentPortal);
      return headings.find(node => normal(node.textContent) === wanted) ||
        headings.find(node => normal(node.textContent).includes(wanted)) || null;
    }
    return document.querySelector(target);
  }
  function scrollToSectionAfterNavigation(key, target, trigger) {
    if (!target) {
      if (trigger) {
        trigger.textContent = 'Open tab (no subsection link yet)';
        trigger.title = 'This help topic opens the correct tab; an exact subsection link is not yet configured.';
      }
      return;
    }
    let attempts = 0;
    const seek = () => {
      const section = findHelpSectionTarget(target);
      if (section && isVisibleInCurrentPortal(section)) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (++attempts < 30) {
        window.setTimeout(seek, 120);
        return;
      }
      if (trigger) {
        trigger.textContent = 'Section unavailable — tab opened';
        trigger.title = 'The destination section did not appear. You are on the correct tab; use its page headings to continue.';
        trigger.disabled = true;
      }
    };
    window.setTimeout(seek, 120);
  }
  function navigate(key, target) {
    if (key === 'chat' || key === 'support') {
      const label = key === 'chat' ? 'Chat' : 'Support';
      const button = Array.from(document.querySelectorAll('#app button, #app [role="button"]')).find(node => (node.textContent || '').trim().toLowerCase() === label.toLowerCase() && isVisibleInCurrentPortal(node));
      if (button) button.click();
      return;
    }
    const items = getNavItems();
    const item = items.find(entry => entry.key === key);
    if (!item) return;
    const node = Array.from(document.querySelectorAll(
      '.sidebar-nav .sidebar-item[onclick], .teacher-sidebar .sidebar-item[onclick], .parent-sidebar .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick], [onclick*="setStudentPortalSection("]'
    )).find(el => (el.getAttribute('onclick') || '') === item.handler);
    if (node) node.click();
    else if (/setTab\(/.test(item.handler) && typeof window.setTab === 'function') window.setTab(key);
    else if (/setTeacherPortalTab\(/.test(item.handler) && typeof window.setTeacherPortalTab === 'function') window.setTeacherPortalTab(key);
    else if (/setStudentPortalSection\(/.test(item.handler) && typeof window.setStudentPortalSection === 'function') window.setStudentPortalSection(key);
    else return;
    scrollToSectionAfterNavigation(key, target, window.__libHelpActiveTrigger || null);
  }
  const SEARCH_SYNONYMS = {
    fee: ['payment', 'pay', 'dues', 'tuition', 'invoice', 'charge'],
    payment: ['fee', 'pay', 'razorpay', 'upi', 'receipt'],
    attendance: ['present', 'absent', 'class log', 'register'],
    schedule: ['timetable', 'calendar', 'class time', 'timing'],
    homework: ['assignment', 'work', 'submission'],
    question: ['paper', 'exam', 'worksheet', 'practice'],
    login: ['sign in', 'password', 'account', 'access'],
    problem: ['issue', 'error', 'bug', 'not working', 'failed'],
    support: ['help', 'complaint', 'report', 'ticket'],
    registration: ['admission', 'enquiry', 'prospect', 'application'],
    teacher: ['tutor', 'faculty', 'instructor'],
    student: ['learner', 'child', 'pupil'],
    parent: ['guardian', 'family'],
    salary: ['payroll', 'earnings', 'payslip'],
    report: ['export', 'download', 'excel', 'statement']
  };
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    let prev = Array.from({length:b.length + 1}, (_,i) => i);
    for (let i=1;i<=a.length;i++) {
      const row=[i];
      for (let j=1;j<=b.length;j++) row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      prev=row;
    }
    return prev[b.length];
  }
  function rank(query, item) {
    const q = normal(query);
    const title = normal(item.title);
    const label = normal(item.label || '');
    const terms = [title, label].concat(item.terms || []).map(normal);
    if (!q) return 0;
    const queryTokens = q.split(' ').filter(Boolean);
    const expanded = queryTokens.concat(queryTokens.flatMap(token => SEARCH_SYNONYMS[token] || []));
    let score = 0;
    terms.forEach(term => {
      if (!term) return;
      if (term === q) score = Math.max(score, 110);
      else if (term.includes(q)) score = Math.max(score, 90);
      else if (q.includes(term) && term.length > 3) score = Math.max(score, 70);
      const tokens = term.split(' ').filter(Boolean);
      const hits = expanded.filter(token => tokens.some(word => word === token || (token.length > 3 && word.startsWith(token))));
      if (expanded.length && hits.length) score = Math.max(score, Math.round(58 * hits.length / expanded.length));
      if (queryTokens.length === 1 && q.length >= 4) {
        const near = tokens.some(word => word.length >= 4 && editDistance(q, word) <= 1);
        if (near) score = Math.max(score, 42);
      }
    });
    return score;
  }
  function renderResults(root, query) {
    const results = root.querySelector('[data-help-results]');
    if (!results) return;
    const nav = getNavItems();
    const q = normal(query);
    if (!q) {
      results.innerHTML = '<div class="lib-help-hint">Search menu options or describe what you want to do.</div>';
      return;
    }
    const candidates = [];
    nav.forEach(item => candidates.push({ key: item.key, title: item.label, label: 'Menu', help: 'Open this section of MY LIB.', terms: [] }));
    tasksForRole().forEach(task => {
      // Route help articles to the actual control/section, not just the parent tab.
      // Keep these selectors tied to stable IDs in index.html.
      const sectionTargets = {
        // Teacher Dashboard — verified anchors in index.html
        'View earnings or download my salary slip': '#earningsReveal',
        'Review students needing renewal': getRole() === 'Teacher' ? '#teacherRenewalSection' : '#studentsNeedingRenewalSection',
        'Review my demo classes and bonus': '#teacherDemoSection',
        'Find or add a student note': '#teacherNoteSearchBox',
        // Admin Fees — verified anchors in index.html
        'Raise or send a fee request': '#raiseFeeRequestsSection',
        'Manage fee requests and payments': '#pendingFeeRequestsSection',
        'Review pending fee requests': '#pendingFeeRequestsSection',
        'Use the fee calculator': '#feeCalculatorSection',
        // Teacher pages — resolve against visible, rendered section headings.
        'Manage my class schedule': 'text:Class Schedule',
        'Update class frequency for a student': 'text:Class Frequency Setup',
        'View my students’ class frequency': 'text:My Students Class Frequency',
        'Find a student and check class balance': 'text:My Students',
        'Create or update a student study plan': 'text:Study Plans',
        'Assign homework or review submissions': 'text:Homework',
        'Use Question Bank and practice papers': 'text:Past Papers',
        'Prepare lessons and share teaching resources': 'text:Lesson Preparation',
        'Give attendance for a class': 'text:Give Attendance',
        'View my attendance report': 'text:My Attendance Report',
        'Set my availability and leave dates': 'text:Availability',
        'Review my demo analysis': 'text:My Demo Analysis',
        'Review class delivery performance': 'text:Class Delivery Intelligence',
        'Review my teaching performance': 'text:Teacher Performance Intelligence',
        // Admin pages — target actual page headings where they are rendered.
        'Find a prospect or new registration': 'text:New registrations',
        'Student onboarding and communication': 'text:Student Onboarding',
        'Find a student or subscription': 'text:Students & Subscriptions',
        'Find parent details': 'text:Parents',
        'View teacher payroll': 'text:Payroll',
        'View or export reports': 'text:Reports & Export',
        'Open the Question Bank': 'text:Question Bank',
        'Record a class in Class Log': 'text:Class Log',
        'Review pending fee requests': '#pendingFeeRequestsSection',
        'Use the fee calculator': '#feeCalculatorSection',
        'Manage demo bookings and conversions': '#demo-register-heading'
      };
      const sectionTarget = sectionTargets[task.title] || null;
      if (task.helpOnly) candidates.push({ ...task, sectionTarget, label: 'Help', menuLabel: nav.find(item => item.key === task.key)?.label });
      else if (nav.some(item => item.key === task.key)) candidates.push({ ...task, sectionTarget, label: 'How to', menuLabel: nav.find(item => item.key === task.key).label });
    });
    const ranked = candidates.map(item => ({ item, score: rank(q, item) }))
      .filter(entry => entry.score > 0)
      .sort((a,b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 6);
    if (!ranked.length) {
      results.innerHTML = '<div class="lib-help-empty">No matching menu or task found. Try a shorter term, such as “fees”, “attendance” or “student”.</div>';
      return;
    }
    results.innerHTML = ranked.map(({item}, index) => `
      <button type="button" class="lib-help-result" data-help-action="${item.label === 'Menu' ? 'navigate' : 'article'}" data-help-key="${esc(item.key)}" data-help-index="${index}">
        <span class="lib-help-result-main">
          <strong>${esc(item.title)}</strong>
          <small>${esc(item.help)}${item.menuLabel ? ' Destination: ' + esc(item.menuLabel) + '.' : ''}</small>
        </span>
        <span class="lib-help-result-type">${esc(item.label)}</span>
        <span class="lib-help-arrow" aria-hidden="true">${item.label === 'Menu' ? '→' : '›'}</span>
      </button>`).join('');
    root.__helpRanked = ranked.map(entry => entry.item);
  }
  function refreshQuickActions(root) {
    const quick = root && root.querySelector("[data-help-quick]");
    if (!quick) return;
    const nav = getNavItems();
    const available = (QUICK_BY_ROLE[getRole()] || []).filter(query => tasksForRole().some(task => rank(query, task) > 0 && (task.helpOnly || nav.some(item => item.key === task.key))));
    quick.innerHTML = available.map(query => '<button type="button" data-help-query="' + esc(query) + '">' + esc(query) + '</button>').join("");
    const input = root.querySelector("[data-help-input]");
    quick.hidden = !!(input && input.value.trim());
  }
  function mount() {
    const app = document.getElementById('app');
    const topbar = app && app.querySelector('.topbar');
    if (!topbar) return;
    let root = app.querySelector('#lib-help-search');
    if (root) return;
    root = document.createElement('section');
    root.id = 'lib-help-search';
    root.setAttribute('aria-label', 'MY LIB Help and Search');
    root.innerHTML = `
      <div class="lib-help-head"><div><strong>MY LIB Help &amp; Search</strong><span>Find a feature or learn how to do something</span></div></div>
      <div class="lib-help-input-wrap"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="What would you like to do? e.g. send a fee request" aria-label="Search MY LIB features and help" data-help-input><button type="button" data-help-clear aria-label="Clear search">×</button></div>
      <div class="lib-help-quick" data-help-quick></div>
      <div class="lib-help-results" data-help-results><div class="lib-help-hint">Search menu options or describe what you want to do.</div></div>
      <section class="lib-help-article" data-help-article hidden aria-live="polite"></section>`;
    topbar.insertAdjacentElement('afterend', root);
    refreshQuickActions(root);
    const input = root.querySelector('[data-help-input]');
    input.addEventListener('input', () => {
      root.querySelector('[data-help-quick]').hidden = !!input.value.trim();
      renderResults(root, input.value);
    });
    root.querySelector('[data-help-clear]').addEventListener('click', () => {
      input.value = ''; root.querySelector('[data-help-quick]').hidden = false;
      renderResults(root, ''); input.focus();
    });
    root.querySelector('[data-help-quick]').addEventListener('click', event => {
      const button = event.target.closest('[data-help-query]');
      if (!button) return;
      input.value = button.getAttribute('data-help-query');
      root.querySelector('[data-help-quick]').hidden = true;
      renderResults(root, input.value);
    });
    root.querySelector('[data-help-results]').addEventListener('click', event => {
      const button = event.target.closest('[data-help-action]');
      if (!button) return;
      const key = button.getAttribute('data-help-key');
      if (button.getAttribute('data-help-action') === 'navigate') { navigate(key); return; }
      const item = root.__helpRanked && root.__helpRanked[Number(button.getAttribute('data-help-index'))];
      if (!item) return;
      const article = root.querySelector('[data-help-article]');
      const destination = item.menuLabel ? '<p class="lib-help-destination">Open section: <b>' + esc(item.menuLabel) + '</b></p><button type="button" class="lib-help-open" data-help-open="' + esc(key) + '" data-help-target="' + esc(item.sectionTarget || '') + '">Open this section</button>' : '';
      article.innerHTML = '<div class="lib-help-article-head"><div><span class="lib-help-kicker">HELP ARTICLE · ' + esc(item.label || 'Help') + '</span><h3>' + esc(item.title) + '</h3></div><button type="button" class="lib-help-close" data-help-close aria-label="Close help article">×</button></div><p>' + esc(item.help || 'Follow the instructions on the relevant page.') + '</p>' + destination + '<div class="lib-help-feedback"><span>Was this guidance helpful?</span><button type="button" data-help-vote="yes">Yes</button><button type="button" data-help-vote="no">Not quite</button></div><p class="lib-help-feedback-note" data-help-feedback-note hidden></p><button type="button" class="lib-help-report" data-help-report>Report inaccurate guidance</button>';
      article.hidden = false;
      article.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    root.querySelector('[data-help-article]').addEventListener('click', event => {
      const close = event.target.closest('[data-help-close]');
      if (close) { root.querySelector('[data-help-article]').hidden = true; return; }
      const open = event.target.closest('[data-help-open]');
      if (open) { window.__libHelpActiveTrigger = open; navigate(open.getAttribute('data-help-open'), open.getAttribute('data-help-target')); window.__libHelpActiveTrigger = null; return; }
      const vote = event.target.closest('[data-help-vote]');
      if (vote) {
        const note = root.querySelector('[data-help-feedback-note]');
        note.textContent = vote.getAttribute('data-help-vote') === 'yes' ? 'Thank you for your feedback.' : 'Thank you. Please use Support to tell us what needs correcting.';
        note.hidden = false;
        return;
      }
      const report = event.target.closest('[data-help-report]');
      if (report) navigate('support');
    });
  }
  function addStyles() {
    if (document.getElementById('lib-help-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'lib-help-search-styles';
    style.textContent = `
      #lib-help-search{margin:0 0 16px;padding:13px 16px 12px;background:var(--paper,#fbf9f3);border:1px solid var(--line,#ded5bd);border-radius:10px;box-shadow:var(--card-shadow,0 1px 2px rgba(0,0,0,.05));}
      .lib-help-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.lib-help-head strong{display:block;font-family:'Zilla Slab',serif;font-size:17px;color:var(--forest,#3c5e42)}.lib-help-head span{display:block;font-size:12px;color:var(--muted,#7c7461);margin-top:2px}
      
      .lib-help-input-wrap{display:flex;align-items:center;gap:9px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;padding:0 10px;min-height:43px}.lib-help-input-wrap>span{font-size:23px;color:var(--muted,#7c7461)}.lib-help-input-wrap input{flex:1;min-width:0;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important;color:var(--ink,#232a24)!important;font:14px 'Work Sans',sans-serif!important;padding:10px 0!important}.lib-help-input-wrap button{border:0;background:transparent;color:var(--muted,#7c7461);font-size:22px;cursor:pointer}
      .lib-help-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.lib-help-quick button{border:1px solid var(--line,#ded5bd);background:transparent;color:var(--forest,#3c5e42);border-radius:20px;padding:5px 9px;font:600 11px 'Work Sans',sans-serif;cursor:pointer}.lib-help-quick button:hover{background:#e7eee5}
      .lib-help-results{display:grid;gap:6px;margin-top:9px}.lib-help-hint,.lib-help-empty{font-size:12px;color:var(--muted,#7c7461);padding:4px 1px}.lib-help-result{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:10px 11px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;color:var(--ink,#232a24);cursor:pointer}.lib-help-result:hover{border-color:var(--forest,#3c5e42);background:#f8faf6}.lib-help-result-main{display:block;min-width:0;flex:1}.lib-help-result-main strong{display:block;font-size:13px}.lib-help-result-main small{display:block;font-size:11px;line-height:1.45;color:var(--muted,#7c7461);margin-top:3px}.lib-help-result-type{font-size:10px;font-weight:700;color:var(--forest,#3c5e42);white-space:nowrap}.lib-help-arrow{font-size:17px;color:var(--forest,#3c5e42)}
      .lib-help-article{margin-top:10px;padding:13px;border:1px solid var(--forest,#3c5e42);border-radius:9px;background:#fff}.lib-help-article-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.lib-help-kicker{font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--forest,#3c5e42)}.lib-help-article h3{margin:3px 0 8px;font-size:15px;color:var(--ink,#232a24)}.lib-help-article p{font-size:13px;line-height:1.55;color:var(--ink,#232a24);margin:0 0 10px}.lib-help-close{border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--muted,#7c7461)}.lib-help-destination{font-size:12px!important;color:var(--muted,#7c7461)!important}.lib-help-open,.lib-help-report{border:1px solid var(--forest,#3c5e42);background:var(--forest,#3c5e42);color:#fff;border-radius:6px;padding:7px 11px;font-weight:600;cursor:pointer}.lib-help-report{background:transparent;color:var(--forest,#3c5e42);margin-top:8px}.lib-help-feedback{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding-top:9px;border-top:1px solid var(--line,#ded5bd);font-size:11px;color:var(--muted,#7c7461)}.lib-help-feedback button{border:1px solid var(--line,#ded5bd);background:#fff;border-radius:16px;padding:4px 9px;cursor:pointer}.lib-help-article .lib-help-feedback-note{margin:8px 0 0;font-size:11px;color:var(--forest,#3c5e42)}
      @media(max-width:600px){#lib-help-search{padding:11px 10px}.lib-help-head strong{font-size:15px}.lib-help-result{align-items:flex-start}.lib-help-result-type{font-size:9px}}
    `;
    document.head.appendChild(style);
  }
  function start() {
    addStyles();
    mount();
    const app = document.getElementById('app');
    if (!app || window.__libHelpSearchObserver) return;
    window.__libHelpSearchObserver = new MutationObserver(records => {
      if (!app.querySelector('#lib-help-search')) { mount(); return; }
      const root = app.querySelector('#lib-help-search');
      const portalChanged = records.some(record => {
        const target = record.target && (record.target.nodeType === 1 ? record.target : record.target.parentElement);
        return target && !root.contains(target) && !(target.closest && target.closest('#lib-help-search'));
      });
      if (portalChanged) {
        refreshQuickActions(root);
        const input = root.querySelector('[data-help-input]');
        if (input && input.value.trim()) renderResults(root, input.value);
      }
    });
    window.__libHelpSearchObserver.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
