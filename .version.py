import re, time
root = 'F:/Glanx/glanx-flow'
V = time.strftime('%Y%m%d%H%M')
# index.html: versión en los enlaces para que el navegador no use el archivo viejo
p = root + '/index.html'; s = open(p, encoding='utf-8').read()
s = re.sub(r'href="styles\.css(\?v=\w+)?"', f'href="styles.css?v={V}"', s)
s = re.sub(r'src="app\.js(\?v=\w+)?"', f'src="app.js?v={V}"', s)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
# app.js: misma versión, para avisar «Hay una versión nueva» a las pestañas viejas
p = root + '/app.js'; s = open(p, encoding='utf-8').read()
s = re.sub(r"const APP_V = '\w+';", f"const APP_V = '{V}';", s, count=1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print(V)
