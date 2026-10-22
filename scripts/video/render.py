"""Monta o filme a partir de capturas reais. Não inventa clipes ausentes."""
from pathlib import Path
import argparse
import json
import shutil
import subprocess
import textwrap

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'out/comercial-zenite'
RENDER = OUT / 'render'
FFMPEG = ROOT / 'out/video-tools/package/ffmpeg.exe'
FILM = json.loads((ROOT / 'scripts/video/film.json').read_text(encoding='utf-8'))

def run(args):
    subprocess.run([str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], cwd=RENDER, check=True)

def textfile(name, text):
    file = RENDER / name
    file.write_text(text, encoding='utf-8')
    return name

def text(name, size, x, y, color='white', extra=''):
    return f'drawtext=fontfile=font.ttf:textfile={name}:fontsize={size}:fontcolor={color}:x={x}:y={y}' + (':' + extra if extra else '')

def card(chapter):
    end = chapter['id'] == 'outro'
    duration = chapter['duration']
    title = textfile(chapter['id'] + '-brand.txt', 'Zênite')
    subtitle = textfile(chapter['id'] + '-subtitle.txt', chapter['title'] if end else 'Vários agentes. Um só espaço para trabalhar.')
    kicker = textfile(chapter['id'] + '-kicker.txt', 'DA IDEIA AO PRÓXIMO PASSO' if not end else 'EXPERIMENTE O SEU PRÓXIMO PROJETO')
    foot = textfile(chapter['id'] + '-foot.txt', 'PARA WINDOWS     ·     github.com/Nata-Felix/O')
    filters = [
        '[0:v]drawgrid=w=110:h=110:t=1:c=0x8ea2ff@0.07',
        "crop=1920:1080:x='60+20*sin(t/8)':y='60+15*cos(t/9)'",
        'drawbox=x=146:y=775:w=1580:h=1:color=0x8ea2ff@0.24:t=fill',
        text(kicker, 22, 150, 150, '0x9baeff', "alpha='min(1,max(0,(t-.1)*2))'"),
        text(title, 132, 352, "355+20*exp(-3*t)", '0xf2f4ff', "alpha='min(1,max(0,t*2))'"),
        text(subtitle, 38, 355, 535, '0xb7c3e4', "alpha='min(1,max(0,(t-.5)*2))'"),
        text(foot, 23, 150, 838, '0x8796bc', "alpha='min(1,max(0,(t-1)*2))'"),
        f'fade=t=in:st=0:d=0.5,fade=t=out:st={duration-.7}:d=0.7[bg]',
    ]
    graph = ','.join(filters) + ';[1:v]scale=154:154,format=rgba,fade=t=in:st=0.2:d=0.6:alpha=1[logo];[bg][logo]overlay=150:365:shortest=1[v]'
    file = RENDER / (chapter['id'] + '.mp4')
    run(['-f', 'lavfi', '-i', f'color=c=0x080b17:s=2040x1200:r=25:d={duration}', '-loop', '1', '-i', ROOT / 'build/icon.png', '-filter_complex', graph, '-map', '[v]', '-t', duration, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', file])
    return file

def footage(chapter, number):
    raw = OUT / 'raw' / (chapter['id'] + '.mp4')
    if not raw.exists():
        raise SystemExit(f'Captura real ausente: {raw.name}. O filme não será preenchido com uma simulação.')
    title = textfile(chapter['id'] + '-title.txt', chapter['title'])
    sub = textfile(chapter['id'] + '-description.txt', '\n'.join(textwrap.wrap(chapter['subtitle'], width=94)))
    badge = textfile(chapter['id'] + '-number.txt', f'{number:02d} / PROJETO AURORA · DEMONSTRAÇÃO REAL')
    filters = [
        'scale=1920:1080:force_original_aspect_ratio=decrease',
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080b17',
        "drawbox=x=0:y=833:w=iw:h=247:c=0x080b17@0.93:t=fill:enable='between(t,.2,5.5)'",
        text(badge, 18, 76, 860, '0x9caeff', "enable='between(t,.2,5.5)'"),
        text(title, 39, 76, 895, 'white', "enable='between(t,.2,5.5)'"),
        text(sub, 22, 76, 956, '0xc6cfe5', "line_spacing=8:enable='between(t,.2,5.5)'"),
        'fps=25',
    ]
    file = RENDER / (chapter['id'] + '.mp4')
    run(['-i', raw, '-vf', ','.join(filters), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', file])
    return file

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--intro-only', action='store_true')
    args = parser.parse_args()
    RENDER.mkdir(parents=True, exist_ok=True)
    font = Path('C:/Windows/Fonts/segoeui.ttf')
    shutil.copyfile(font, RENDER / 'font.ttf')
    if args.intro_only:
        video = card(FILM['chapters'][0])
        output = OUT / 'previa-abertura-sem-locucao.mp4'
        run(['-i', video, '-i', OUT / 'audio/trilha-original.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'afade=t=in:d=1,afade=t=out:st=6:d=2', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output])
    else:
        # Conferir antes de gastar tempo renderizando os cartões e os capítulos.
        for chapter in FILM['chapters']:
            if not chapter.get('card') and not (OUT / 'raw' / (chapter['id'] + '.mp4')).exists():
                raise SystemExit('Faltam as capturas reais. Nenhum comercial completo foi produzido.')
        videos = [card(chapter) if chapter.get('card') else footage(chapter, i) for i, chapter in enumerate(FILM['chapters'])]
        concat = RENDER / 'concat.txt'
        concat.write_text('\n'.join("file '" + file.name + "'" for file in videos), encoding='utf-8')
        output = OUT / 'Zenite-comercial-sem-locucao.mp4'
        run(['-f', 'concat', '-safe', '0', '-i', concat, '-stream_loop', '-1', '-i', OUT / 'audio/trilha-original.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output])
    print(output)

if __name__ == '__main__':
    main()
