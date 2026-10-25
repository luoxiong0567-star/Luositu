# -*- coding: utf-8 -*-
# 生成分享物料：入口二维码 + 3:4 竖版封面
import os
import segno
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
URL = 'https://human-light-science.app.workbuddy.host/?sharecode=RF2TV443LO'
DOCS = os.path.join(ROOT, 'docs')
REL = os.path.join(ROOT, 'release')
BG = (5, 7, 13)


def font(name, size):
    p = os.path.join('C:/Windows/Fonts', name)
    try:
        return ImageFont.truetype(p, size)
    except Exception:
        return ImageFont.load_default()


def center_text(d, text, y, f, fill, cw):
    w = d.textlength(text, font=f)
    d.text(((cw - w) / 2, y), text, font=f, fill=fill)


def make_cover(src, out, lines, sub, foot):
    base = Image.open(src).convert('RGB')
    W, H = base.size
    CW, CH = 1080, 1440
    scale = CW / float(W)
    th = int(round(H * scale))
    base = base.resize((CW, th), Image.LANCZOS)
    canvas = Image.new('RGB', (CW, CH), BG)
    y0 = (CH - th) // 2
    if y0 < 0:
        y0 = 0
    canvas.paste(base, (0, y0))
    d = ImageDraw.Draw(canvas)
    band = 400
    for i in range(band):
        k = 1 - i / float(band)
        a = int(235 * (k ** 1.5))
        d.line([(0, i), (CW, i)], fill=(BG[0], BG[1], BG[2]))
        d.line([(0, CH - 1 - i), (CW, CH - 1 - i)], fill=(BG[0], BG[1], BG[2]))
    fb = font('msyhbd.ttc', 98)
    fr = font('msyh.ttc', 40)
    y = 150
    for ln in lines:
        center_text(d, ln, y, fb, (234, 243, 255), CW)
        y += 126
    center_text(d, sub, CH - 250, fr, (125, 211, 252), CW)
    center_text(d, foot, CH - 180, fr, (148, 163, 184), CW)
    canvas.save(out)
    print('COVER -> ' + out)


def make_qr(path):
    q = segno.make(URL, error='m')
    tmp = os.path.join(REL, '_qr_raw.png')
    q.save(tmp, scale=12, border=3)
    im = Image.open(tmp).convert('RGB')
    W, H = im.size
    S = W + 160
    canvas = Image.new('RGB', (S, S + 140), '#ffffff')
    canvas.paste(im, (80, 80))
    d = ImageDraw.Draw(canvas)
    f1 = font('msyhbd.ttc', 50)
    f2 = font('msyh.ttc', 30)
    center_text(d, '人类之光 · HUMAN LIGHT', S + 8, f1, (11, 18, 32), S)
    center_text(d, '手机浏览器直接打开，断网也能看', S + 74, f2, (100, 116, 139), S)
    canvas.save(path)
    print('QR    -> ' + path)


make_qr(os.path.join(REL, '入口二维码.png'))
make_cover(os.path.join(DOCS, 'frame-01-2-1-cosmos.png'),
           os.path.join(REL, '小红书封面.png'),
           ['一个文件', '装下整个宇宙'],
           '三维科学可视化 · 作者 罗司徒',
           '双击即开 · 断网可用 · 16 个可交互场景')
