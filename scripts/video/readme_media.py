"""Imagens do README a partir das gravações reais do comercial (out/comercial-zenite).

Gera docs/images/: banner de abertura, prints 16:9 em JPG e um GIF curto do Sol construindo
o canvas. Rodar depois das tomadas (studio.cjs) existirem.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'out/video-tools/python'))
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAW = ROOT / 'out/comercial-zenite/raw'
STILLS = ROOT / 'out/comercial-zenite/stills'
IMAGES = ROOT / 'docs/images'
FFMPEG = ROOT / 'out/video-tools/package/ffmpeg.exe'
CROP = 'crop=1767:994:68:0'  # 16:9 das tomadas de 1904×994


def ff(*args):
    subprocess.run([str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], check=True)


def frame(name, src, at, crop=CROP):
    ff('-ss', at, '-i', RAW / src, '-frames:v', 1, '-vf', f'{crop},scale=1600:-2:flags=lanczos', '-q:v', 3, IMAGES / f'{name}.jpg')


def still(name, src):
    Image.open(STILLS / src).convert('RGB').resize((1600, 900), Image.LANCZOS).save(IMAGES / f'{name}.jpg', quality=88)


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), radius, fill=255)
    img.putalpha(mask)
    return img


def banner():
    """Abertura do README: nome, frase e o canvas gigante numa moldura com sombra."""
    W, H = 1800, 820
    base = Image.new('RGB', (W, H), (8, 10, 18))
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((-300, -300, 800, 650), fill=(58, 44, 140))
    g.ellipse((1150, 350, 2150, 1250), fill=(18, 80, 96))
    bg = Image.blend(base, glow.filter(ImageFilter.GaussianBlur(170)), 0.6).convert('RGBA')
    dots = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for x in range(20, W, 44):
        for y in range(20, H, 44):
            dd.ellipse((x, y, x + 2, y + 2), fill=(170, 185, 255, 38))
    bg.alpha_composite(dots)
    d = ImageDraw.Draw(bg)
    icon = Image.open(ROOT / 'build/icon.png').convert('RGBA').resize((112, 112), Image.LANCZOS)
    bg.alpha_composite(icon, (90, 170))
    d.text((86, 300), 'Zênite', font=ImageFont.truetype('C:/Windows/Fonts/seguisb.ttf', 100), fill=(244, 246, 255))
    sub = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 33)
    for i, line in enumerate(['Seus agentes de IA trabalhando', 'juntos, num canvas infinito.']):
        d.text((92, 440 + 46 * i), line, font=sub, fill=(200, 208, 240))
    small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 23)
    d.text((92, 580), 'Claude Code · Codex · Antigravity · Grok', font=small, fill=(132, 144, 182))
    d.text((92, 616), 'Grátis e de código aberto · Windows', font=small, fill=(132, 144, 182))
    shot = Image.open(IMAGES / 'canvas-zen.jpg').convert('RGB').resize((1040, 585), Image.LANCZOS)
    shot = rounded(shot.convert('RGBA'), 22)
    x, y = 690, 118
    shadow = Image.new('RGBA', bg.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 24, x + 1040, y + 609), 26, fill=(0, 0, 0, 210))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(32)))
    bg.alpha_composite(shot, (x, y))
    frame = Image.new('RGBA', bg.size, (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((x - 2, y - 2, x + 1042, y + 587), 24, outline=(150, 168, 255, 110), width=2)
    bg.alpha_composite(frame)
    bg.convert('RGB').save(IMAGES / 'banner.jpg', quality=90)
    (IMAGES / 'canvas-zen.jpg').unlink()


def gif():
    """O Sol montando a equipe e a tabela de bugs se preenchendo, em 9 s."""
    palette = IMAGES / 'paleta.png'
    chain = f'trim=start=7:end=40,setpts=(PTS-STARTPTS)/3.6,fps=10,{CROP},scale=960:-2:flags=lanczos'
    ff('-i', RAW / 'story-bugs.mp4', '-vf', f'{chain},palettegen=stats_mode=diff', palette)
    ff('-i', RAW / 'story-bugs.mp4', '-i', palette, '-lavfi', f'{chain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4', IMAGES / 'sol-construindo.gif')
    palette.unlink()


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    frame('canvas-projeto', 'spot-wide.mp4', 6)
    still('painel-admin', 'gigante-admin.png')
    still('qualidade-operacao', 'gigante-infra.png')
    frame('sol-pedido', 'story-bugs.mp4', 6.3)
    frame('menu-astros', 'story-bugs.mp4', 14.5)
    frame('tabela-bugs', 'story-bugs.mp4', 40.5)
    frame('thumb-gerada', 'story-youtube.mp4', 20.6)
    frame('ligacoes', 'connections.mp4', 3.0, 'crop=1200:675:200:60')
    frame('terminal-git', 'spot-git.mp4', 2)
    frame('canvas-zen', 'spot-wide.mp4', 4)
    banner()
    gif()
    for f in sorted(IMAGES.iterdir()):
        print(f'{f.name:28} {f.stat().st_size // 1024:>6} KB')


if __name__ == '__main__':
    main()
