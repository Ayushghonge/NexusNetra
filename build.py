"""Build Nexus Netra as ONE self-contained page.

Every photo, the poster and the film are embedded in the HTML, so the page
works anywhere: the published link, phones, or a single file uploaded to any
web host. Outputs:
  out/artifact/index.html  - published page (the Artifact adds the skeleton)
  out/site/index.html      - complete standalone file for direct hosting
"""
import base64, json, os, re

SP = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(SP, 'src')
out = os.path.join(SP, 'out')
INLINE = os.path.join(SP, '..', 'inline')

P = json.load(open(os.path.join(SP, '..', 'logo', 'final_paths.json')))
INK = 'fill:var(--nn-ink,#1D5A4E)'
GOLD = 'fill:var(--nn-gold,#CC8A2B)'
mark = ''.join(f'<path style="{INK if c == "g" else GOLD}" d="{d}"/>' for c, d in P['mark'])
cword = f'<path style="{INK}" d="{P["cword_g"]}"/><path style="{GOLD}" d="{P["cword_o"]}"/>'
word = f'<path style="{INK}" d="{P["word_g"]}"/><path style="{GOLD}" d="{P["word_o"]}"/>'
tag = f'<path style="{INK}" d="{P["tag_g"]}"/>'


def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode('ascii')


def data_uri(path, mime):
    return f'data:{mime};base64,{b64(path)}'


body = (open(os.path.join(src, 'body.html')).read()
        .replace('{{MARK}}', mark).replace('{{CWORD}}', cword)
        .replace('{{WORD}}', word).replace('{{TAG}}', tag))

# embed photos + poster
for name in sorted(set(re.findall(r'\{\{IMG:([\w-]+)\}\}', body))):
    body = body.replace('{{IMG:%s}}' % name, data_uri(os.path.join(INLINE, name + '.webp'), 'image/webp'))
assert '{{' not in body, re.findall(r'\{\{[^}]*\}\}', body)[:5]

css = open(os.path.join(src, 'styles.css')).read()
js = open(os.path.join(src, 'app.js')).read()

# the film travels inside the page; the script reads it after the page has rendered
film = b64(os.path.join(INLINE, 'film.mp4'))
film_block = '<script type="text/plain" id="nn-film">\n' + '\n'.join(film[i:i + 4096] for i in range(0, len(film), 4096)) + '\n</script>\n'

DESC = ('Nexus Netra is ARC Advisory’s Governance Operating System, bringing business performance '
        'monitoring (BPM), continuous control monitoring (CCM) and enterprise risk management (ERM) '
        'into one connected governance framework.')
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,200..1000;1,200..1000&amp;display=swap">\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&amp;text=%E0%A4%A8%E0%A5%87%E0%A4%A4%E0%A5%8D%E0%A4%B0&amp;display=swap">\n')
JSFLAG = '<script>document.documentElement.classList.add("js")</script>\n'

# 1) published page (skeleton added by the Artifact service)
art = ('<title>Nexus Netra Governance OS</title>\n'
       '<meta name="claude:viewport-fit-sides" content="cover">\n'
       f'<meta name="description" content="{DESC}">\n' + FONTS + JSFLAG +
       '<style>\n' + css + '\n</style>\n' + body +
       '\n<script>\n' + js + '\n</script>\n' + film_block)

# 2) standalone single file for direct hosting
favicon = data_uri(os.path.join(SP, 'assets', 'favicon.svg'), 'image/svg+xml')
touch = data_uri(os.path.join(SP, 'assets', 'apple-touch-icon.png'), 'image/png')
site = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<title>Nexus Netra Governance OS | ARC Advisory</title>\n'
        f'<meta name="description" content="{DESC}">\n'
        '<meta name="theme-color" content="#FBFAF6">\n'
        '<meta property="og:type" content="website">\n'
        '<meta property="og:title" content="Nexus Netra Governance OS">\n'
        '<meta property="og:description" content="Transforming Governance with Connected Intelligence. Governance technology from ARC Advisory.">\n'
        f'<link rel="icon" href="{favicon}" type="image/svg+xml">\n'
        f'<link rel="apple-touch-icon" href="{touch}">\n'
        + FONTS + JSFLAG +
        '<style>\n:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n'
        '[hidden]{display:none!important}\n' + css + '\n</style>\n</head>\n<body>\n' + body +
        '\n<script>\n' + js + '\n</script>\n' + film_block + '</body>\n</html>\n')

for d, html in (('artifact', art), ('site', site)):
    os.makedirs(os.path.join(out, d), exist_ok=True)
    for f in os.listdir(os.path.join(out, d)):
        p = os.path.join(out, d, f)
        if os.path.isdir(p):
            import shutil
            shutil.rmtree(p)
    open(os.path.join(out, d, 'index.html'), 'w').write(html)
    print(f'{d:9} index.html  {len(html.encode()) / 1048576:.2f} MB  (single file, no assets folder)')
