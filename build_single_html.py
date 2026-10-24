# -*- coding: utf-8 -*-
"""
人类之光 · 唯一发布脚本（HTML-only 交付）

产出两个交付物到 release/：
    1. 人类之光.html          —— 单文件自包含（微信/钉钉/邮件直接发，双击即开）
    2. 人类之光-网页版.zip     —— web/ 文件夹形态（需要源码结构时的备选）

用法：
    python build_single_html.py                    # 输出两个文件到 release/
    python build_single_html.py 输出路径.html       # 仅导出单文件到指定路径
"""
import os
import re
import sys
import shutil
import zipfile
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, 'web')
DEFAULT_OUT = os.path.join(ROOT, 'release', '人类之光.html')
DEFAULT_ZIP = os.path.join(ROOT, 'release', '人类之光-网页版.zip')
# 线上发布入口：云端分享链接的 sharecode 只对首个 HTML 请求生效，
# 页面里的 css / js 子请求不带该参数、会被网关 403 拦掉（表现为整页无样式的裸 HTML）。
# 因此线上必须用「单文件」作为入口，全部资源内联，只有一次请求。
SINGLE_ENTRY = os.path.join(WEB, 'single.html')

# 内联时会破坏 HTML 结构的字符序列 —— 出现即说明该文件不能直接内联
FORBIDDEN = ['</script', '<!--', '<style', '</style']


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def build(out_path):
    index = os.path.join(WEB, 'index.html')
    if not os.path.exists(index):
        raise SystemExit('未找到 ' + index)

    html = read(index)
    inlined = []      # (相对路径, 字节数)

    # 1) <link rel="stylesheet" href="...">  ->  <style>
    def sub_css(m):
        rel = m.group(1)
        src = os.path.join(WEB, rel.replace('/', os.sep))
        css = read(src)
        for bad in FORBIDDEN:
            if bad in css:
                raise SystemExit('CSS 含不可内联内容 %r：%s' % (bad, rel))
        inlined.append((rel, len(css.encode('utf-8'))))
        return '<style>\n/* ==== %s ==== */\n%s\n</style>' % (rel, css)

    html = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]*>', sub_css, html)

    # 2) <script src="..."></script>  ->  <script>
    def sub_js(m):
        rel = m.group(1)
        src = os.path.join(WEB, rel.replace('/', os.sep))
        js = read(src)
        for bad in FORBIDDEN:
            if bad in js:
                raise SystemExit('JS 含不可内联内容 %r：%s' % (bad, rel))
        inlined.append((rel, len(js.encode('utf-8'))))
        return '<script>\n/* ==== %s ==== */\n%s\n</script>' % (rel, js)

    html = re.sub(r'<script\s+src="([^"]+\.js)"\s*>\s*</script>', sub_js, html)

    # 3) 校验：不应再有本地相对引用
    #    先剔除内联 <script>/<style> 正文（KaTeX 等库内部含 src="..." 模板串，会误报）
    bare = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
    bare = re.sub(r'<style[^>]*>.*?</style>', '', bare, flags=re.S)
    leftovers = re.findall(r'(?:src|href)="((?!https?:|data:|#)[^"]+)"', bare)
    if leftovers:
        raise SystemExit('仍有未内联的引用：%s' % leftovers)

    # 4) 注入构建标记（便于确认版本）
    stamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    html = html.replace('</head>', '<!-- 人类之光 · 单文件自包含版 · 构建于 %s -->\n</head>' % stamp, 1)

    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)

    size = os.path.getsize(out_path)
    print('输出: %s' % out_path)
    print('大小: %.2f MB (%d 字节)' % (size / 1048576, size))
    print('内联资源 %d 个:' % len(inlined))
    for rel, n in inlined:
        print('  %8.1f KB  %s' % (n / 1024, rel))
    print('外部引用: 无（完全自包含）')


def build_zip(zip_path):
    """web/ 全量打包为 zip（解压后双击 index.html 的文件夹形态）。"""
    if not os.path.exists(WEB):
        raise SystemExit('未找到 ' + WEB)
    tmp = zip_path + '.tmp'
    count = 0
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for dirpath, _dirs, files in os.walk(WEB):
            for name in files:
                full = os.path.join(dirpath, name)
                if os.path.abspath(full) == os.path.abspath(SINGLE_ENTRY):
                    continue          # 线上入口副本不进 zip（单文件版已在 release/）
                if name.endswith('.genie') or '.workbuddy' in dirpath:
                    continue          # 平台发布标记，不属于交付内容
                rel = os.path.join('人类之光-网页版', 'web',
                                   os.path.relpath(full, WEB))
                zf.write(full, rel)
                count += 1
    os.replace(tmp, zip_path)
    print('输出: %s' % zip_path)
    print('大小: %.2f MB（%d 个文件）' % (os.path.getsize(zip_path) / 1048576, count))


if __name__ == '__main__':
    explicit_out = len(sys.argv) > 1
    out = sys.argv[1] if explicit_out else DEFAULT_OUT
    build(out)
    if not explicit_out:
        # 默认模式：同时刷新 zip；显式指定输出路径时只导出单文件
        build_zip(DEFAULT_ZIP)
        # 同步线上发布入口（单文件），保证重新发布时拿到的是自包含版本
        shutil.copyfile(DEFAULT_OUT, SINGLE_ENTRY)
        print('输出: %s（线上发布入口）' % SINGLE_ENTRY)
