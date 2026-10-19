"""Sections every guide shares: getting started and getting help."""
from guide import CONTACT, steps, note, g2, box, h3


def getting_started(g, chat_who):
    g.add('start', 'Start here', 'Getting started and help', 'Four steps to your first login, and where to get help.', steps([
        ('Open the link', f'Use the link shared by LIB: <b>{CONTACT["app"]}</b>.'),
        ('Sign in', 'Enter the username and password LIB gave you.'),
        ('Set a new password', 'Change it after your first login so only you know it.'),
        ('Add it to your home screen', '<b>Android:</b> tap Install. <b>iPhone:</b> tap Share, then Add to Home Screen.'),
    ]) + note('Forgot your password?', f'Call or WhatsApp LIB on {CONTACT["phone"]} and we will reset it.', 'tip') + h3('Getting help') + g2(
        box('Inside the app', ['<b>Help</b> button: answers how-to questions', '<b>Support</b> button: report an issue',
                               f'<b>Chat</b>: message {chat_who}']),
        box('Contact LIB', [f'WhatsApp / phone: {CONTACT["phone"]}', f'Email: {CONTACT["email"]}', f'Website: {CONTACT["web"]}']),
    ) + '<p style="font-size:8.6pt;color:#6b6a66;margin-top:1mm">You only see your own information. Issues you raise show a status '
        '(Open, In Progress or Resolved) and LIB can reply with a note.</p>')
