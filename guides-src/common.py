"""Sections every guide shares: getting started and getting help."""
from guide import CONTACT, steps, note, g2, box, h3


def getting_started(g, chat_who):
    g.add('start', 'Start here', 'Getting started and help', 'Four steps to your first login, and where to get help.', steps([
        ('Open the link', f'Use the link shared by LIB: <b>{CONTACT["app"]}</b>.'),
        ('Sign in', 'Enter the username and password LIB gave you.'),
        ('Set a new password', 'Change it after your first login so only you know it.'),
        ('Add it to your home screen', '<b>Android:</b> tap Install. <b>iPhone:</b> tap Share, then Add to Home Screen.'),
    ]) + note('Forgot your password?', f'Call or WhatsApp LIB on {CONTACT["phone"]} and we will reset it.', 'tip') + h3('Getting help anywhere in MY LIB') + g2(
        box('Help & Search', ['Use the Help button in the app header for how-to guidance.', 'Use the Help & Search panel to describe the task in everyday words. Try a feature name or a phrase such as “classes left”, “send a fee request” or “submit homework”.', 'The suggestions are based on your login role. Choose a result to open the relevant section when it is available to your account.']),
        box('Contextual help', ['Look for a <b>?</b> beside a page, section or card heading. It explains that part of the screen and the steps available there.', 'Read any notes or warnings before confirming a payment, changing a record or submitting work.']),
    ) + h3('Chat, Support and direct contact') + g2(
        box('Inside the app', ['<b>Support</b>: report a problem and follow its status (Open, In Progress or Resolved). LIB can reply with a note.',
                               f'<b>Chat</b>: message {chat_who}']),
        box('Contact LIB', [f'WhatsApp / phone: {CONTACT["phone"]}', f'Email: {CONTACT["email"]}', f'Website: {CONTACT["web"]}']),
    ) + '<p style="font-size:8.6pt;color:#6b6a66;margin-top:1mm">You only see information permitted for your login. If a menu or action is not available, your role or account permissions may not include it. Do not share your password in Chat or Support.</p>')
