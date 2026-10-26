"""Builds dist/ (the installable PWA) and artifact.html (a single-file preview)."""
import re, shutil, pathlib
root = pathlib.Path(__file__).parent
html = (root/'index.html').read_text()
css = (root/'styles.css').read_text()
ORDER = ['main.js', 'ai.js', 'apa.js', 'formats.js', 'standards.js', 'media.js', 'cloud.js', 'settings.js', 'home.js', 'live.js', 'celebrate.js', 'participant.js']
js = "/* Didasko — live captions, translation, APA notes, live quizzes. Built from src/ by build.py. */\n(() => {\n'use strict';\n" + '\n'.join((root/'src'/f).read_text() for f in ORDER) + "\nboot();\n})();\n"
(root/'app.js').write_text(js)
cfg = (root/'config.js').read_text()

dist = root/'dist'
if dist.exists(): shutil.rmtree(dist)
dist.mkdir()
for f in ['index.html','styles.css','app.js','config.js','sw.js','manifest.webmanifest','database.rules.json','SETUP.md']: shutil.copy(root/f, dist/f)
shutil.copytree(root/'icons', dist/'icons')
shutil.copytree(root/'src', dist/'src')
shutil.copy(root/'build.py', dist/'build.py')
(dist/'.nojekyll').write_text('')
shutil.copy(root/'README.md', dist/'README.md')

head = html.split('<!--HEAD-START-->')[1].split('<!--HEAD-END-->')[0]
head = re.sub(r'<!--PWA-ONLY-START-->.*?<!--PWA-ONLY-END-->', '', head, flags=re.S)
head = head.replace('content="pwa"', 'content="artifact"').replace('<link rel="stylesheet" href="styles.css">', f'<style>\n{css}\n</style>')
body = html.split('<body>')[1].split('</body>')[0]
body = body.replace('<script src="config.js"></script>', f'<script>\n{cfg}\n</script>').replace('<script src="app.js"></script>', f'<script>\n{js}\n</script>')
(root/'artifact.html').write_text(head.strip() + '\n' + body.strip() + '\n')
print('built', sum(1 for _ in dist.rglob('*')), 'files;', len((root/'artifact.html').read_text())//1024, 'KB artifact')
