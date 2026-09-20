# -*- coding: utf-8 -*-
"""一次性工具：把 KaTeX 发行版（js + css + woff2 字体）本地化为可内联的自包含资源。

产出：
    web/vendor/katex.min.js
    web/css/katex.css        （@font-face 的 src 全部替换为 base64 data URI）

运行后本文件可保留，便于后续升级 KaTeX 版本：改 VERSION 后重跑即可。
"""
import base64
import os
import re
import ssl
import urllib.request

VERSION = '0.16.11'
BASE = 'https://cdn.jsdelivr.net/npm/katex@%s/dist/' % VERSION
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, 'web')

FONTS = [
    'KaTeX_AMS-Regular',
    'KaTeX_Caligraphic-Bold',
    'KaTeX_Caligraphic-Regular',
    'KaTeX_Fraktur-Bold',
    'KaTeX_Fraktur-Regular',
    'KaTeX_Main-Bold',
    'KaTeX_Main-BoldItalic',
    'KaTeX_Main-Italic',
    'KaTeX_Main-Regular',
    'KaTeX_Math-BoldItalic',
    'KaTeX_Math-Italic',
    'KaTeX_SansSerif-Bold',
    'KaTeX_SansSerif-Italic',
    'KaTeX_SansSerif-Regular',
    'KaTeX_Script-Regular',
    'KaTeX_Size1-Regular',
    'KaTeX_Size2-Regular',
    'KaTeX_Size3-Regular',
    'KaTeX_Size4-Regular',
    'KaTeX_Typewriter-Regular',
]


def fetch(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=90, context=ctx) as r:
        return r.read()


def main():
    os.makedirs(os.path.join(WEB, 'vendor'), exist_ok=True)
    os.makedirs(os.path.join(WEB, 'css'), exist_ok=True)

    js = fetch(BASE + 'katex.min.js')
    with open(os.path.join(WEB, 'vendor', 'katex.min.js'), 'wb') as fh:
        fh.write(js)
    print('katex.min.js  %.1f KB' % (len(js) / 1024))

    css = fetch(BASE + 'katex.min.css').decode('utf-8')

    total = 0
    for name in FONTS:
        data = fetch(BASE + 'fonts/' + name + '.woff2')
        total += len(data)
        b64 = base64.b64encode(data).decode('ascii')
        uri = 'data:font/woff2;base64,' + b64
        # 定位该字体的 @font-face 块，替换其中的 src 列表
        pat = re.compile(
            r'(@font-face\s*\{[^}]*?src\s*:\s*)([^;}]+)([^}]*?\})', re.S)
        out = []
        last = 0
        hit = 0
        for m in pat.finditer(css):
            if name not in m.group(0):
                continue
            seg = m.group(0)
            if ('"' + name + '.woff2"') not in seg and (name + '.woff2') not in seg:
                continue
            out.append(css[last:m.start(1)])
            out.append(m.group(1) + 'url(' + uri + ") format('woff2')" + m.group(3))
            last = m.end()
            hit += 1
        out.append(css[last:])
        css = ''.join(out)
        print('  %-28s %6.1f KB  (font-face 命中 %d)' % (name, len(data) / 1024, hit))
        if hit == 0:
            raise SystemExit('未能在 CSS 中定位字体块：' + name)

    print('字体合计 %.1f KB → base64 后约 %.1f KB' % (total / 1024, total * 4 / 3 / 1024))

    left = re.findall(r'url\((?!data:)([^)]+)\)', css)
    if left:
        raise SystemExit('仍有外部字体引用：%s' % left[:5])

    head = ('/* KaTeX %s —— 字体已 base64 内嵌，可安全内联进单文件 HTML\n'
            '   生成脚本：_build_katex.py（重新生成：python _build_katex.py） */\n' % VERSION)
    with open(os.path.join(WEB, 'css', 'katex.css'), 'w', encoding='utf-8') as fh:
        fh.write(head + css)
    print('写出 web/css/katex.css  %.1f KB' % (os.path.getsize(os.path.join(WEB, 'css', 'katex.css')) / 1024))


if __name__ == '__main__':
    main()
