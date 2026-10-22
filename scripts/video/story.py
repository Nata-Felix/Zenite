"""Comercial das duas histórias: o Sol corrigindo bugs e o Sol ajudando uma criadora de vídeos.

Planos das gravações reais (raw/story-bugs.mp4 e raw/story-youtube.mp4), acelerados e
recortados; balões do Sol, celular com a mensagem do webhook e legenda palavra a palavra
desenhados com Pillow; narração (voices.py) sobre a trilha (spot-score.py 56).
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'out/video-tools/python'))
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = ROOT / 'out/comercial-zenite'
RAW = OUT / 'raw'
WORK = OUT / 'historias'
FFMPEG = ROOT / 'out/video-tools/package/ffmpeg.exe'
FPS = 25
FONT = 'C:/Windows/Fonts/seguisb.ttf'
FONT_REGULAR = 'C:/Windows/Fonts/segoeui.ttf'
GOLD = (245, 201, 107)
FULL = (0, 0, 1767, 994)          # 16:9 da gravação de 1904×994
SOL = (250, 160, 1010, 568)       # o terminal do Sol no início das histórias
MENU = (230, 160, 760, 428)       # o menu de astros aberto


def run(args, cwd=None):
    result = subprocess.run([str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], cwd=cwd, capture_output=True, text=True, errors='replace')
    if result.returncode:
        raise SystemExit('FFmpeg falhou: ' + result.stderr[-1500:])


def font(size, regular=False):
    return ImageFont.truetype(FONT_REGULAR if regular else FONT, size)


def shot(name, src, start, end, dur, crop=FULL, z=(1.0, 1.08), focus=(.5, .5)):
    """Trecho [start, end] da gravação encaixado em dur segundos, com aproximação suave."""
    x, y, w, h = crop
    speed = (end - start) / dur
    frames = round(dur * FPS)
    p = f'(on/{frames})'
    ease = f'(3*{p}*{p}-2*{p}*{p}*{p})'
    zoom = f'{z[0]}+({z[1]}-{z[0]})*{ease}'
    chain = [f'setpts=(PTS-STARTPTS)/{speed}', f'fps={FPS}', f'crop={w}:{h}:{x}:{y}', 'scale=3840:2160:flags=lanczos',
             f"zoompan=z='{zoom}':x='(iw-iw/zoom)*{focus[0]}':y='(ih-ih/zoom)*{focus[1]}':d=1:s=1920x1080:fps={FPS}",
             'eq=contrast=1.05:saturation=1.1']
    run(['-ss', start, '-i', RAW / src, '-vf', ','.join(chain), '-frames:v', frames, '-an', '-r', FPS,
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', WORK / name])


def end_card(name, dur):
    frames = round(dur * FPS)
    title = "drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf'"
    graph = (f"[0:v]drawgrid=w=120:h=120:t=1:c=0x8ea2ff@0.05,vignette=PI/3[bg];"
             f"[1:v]scale=190:190,format=rgba,fade=t=in:st=0.1:d=0.5:alpha=1[logo];"
             f"[bg][logo]overlay=(W-w)/2:240+20*exp(-6*t)[v];"
             f"[v]{title}:text='Zênite':fontsize=128:fontcolor=white:x=(w-text_w)/2:y=460+30*exp(-9*max(t-0.3\\,0)):alpha='min(1\\,max(0\\,(t-0.3)*3))',"
             f"drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='Seus agentes, trabalhando juntos.':fontsize=46:fontcolor=0xc9d2ff:x=(w-text_w)/2:y=630:alpha='min(1\\,max(0\\,(t-0.8)*3))',"
             f"drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='Grátis para Windows  ·  github.com/Nata-Felix/O':fontsize=30:fontcolor=0x8796bc:x=(w-text_w)/2:y=780:alpha='min(1\\,max(0\\,(t-1.3)*3))',"
             f"fade=t=out:st={dur - 1}:d=1[out]")
    run(['-f', 'lavfi', '-i', f'color=c=0x07090f:s=1920x1080:r={FPS}:d={dur}', '-loop', '1', '-i', ROOT / 'build/icon.png',
         '-filter_complex', graph, '-map', '[out]', '-frames:v', frames, '-an', '-r', FPS, '-c:v', 'libx264', '-preset', 'medium',
         '-crf', '17', '-pix_fmt', 'yuv420p', WORK / name])


# ---------- imagens sobrepostas ----------

def bubble(name, text):
    """Balão do Sol: cartão escuro com borda dourada e o ☀."""
    f = font(46)
    w = int(f.getlength(text)) + 190
    img = Image.new('RGBA', (w + 40, 190), (0, 0, 0, 0))
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((20, 30, w + 20, 170), 36, fill=(0, 0, 0, 150))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 20, w + 20, 150), 34, fill=(18, 20, 32, 245), outline=GOLD, width=3)
    d.ellipse((50, 52, 116, 118), fill=GOLD)
    d.text((83, 85), '☀', font=ImageFont.truetype('C:/Windows/Fonts/seguisym.ttf', 44), fill=(30, 22, 4), anchor='mm')
    d.text((140, 85), text, font=f, fill=(240, 243, 255), anchor='lm')
    img.save(WORK / name)


def phone(name, message):
    """Celular com a conversa: a mensagem enviada pelo webhook do astro."""
    W, H = 560, 1040
    img = Image.new('RGBA', (W + 60, H + 60), (0, 0, 0, 0))
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((30, 40, W + 30, H + 40), 80, fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(24)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((30, 30, W + 30, H + 30), 78, fill=(14, 14, 18, 255))
    d.rounded_rectangle((44, 44, W + 16, H + 16), 66, fill=(11, 20, 26, 255))
    d.rounded_rectangle((W // 2 - 50, 62, W // 2 + 110, 92), 15, fill=(0, 0, 0, 255))
    # Cabeçalho da conversa
    d.rectangle((44, 110, W + 16, 230), fill=(31, 44, 52, 255))
    d.ellipse((76, 135, 146, 205), fill=GOLD)
    d.text((111, 170), '☀', font=ImageFont.truetype('C:/Windows/Fonts/seguisym.ttf', 40), fill=(30, 22, 4), anchor='mm')
    d.text((166, 150), 'Zênite · Sol', font=font(34), fill=(235, 240, 245))
    d.text((166, 192), 'online', font=font(24, True), fill=(140, 160, 170))
    # Ícone verde de mensagem no canto (fone dentro de um balão)
    d.ellipse((W - 70, 140, W - 10, 200), fill=(37, 211, 102))
    d.text((W - 40, 170), '✆', font=ImageFont.truetype('C:/Windows/Fonts/seguisym.ttf', 34), fill='white', anchor='mm')
    # Balão recebido
    words, lines, line = message.split(), [], ''
    f = font(32, True)
    for word in words:
        test = (line + ' ' + word).strip()
        if f.getlength(test) > 380:
            lines.append(line); line = word
        else:
            line = test
    lines.append(line)
    top = 300
    d.rounded_rectangle((76, top, 500, top + 44 * len(lines) + 70), 26, fill=(32, 44, 51, 255))
    for i, l in enumerate(lines):
        d.text((100, top + 24 + 44 * i), l, font=f, fill=(233, 237, 239))
    d.text((470, top + 44 * len(lines) + 34), 'agora', font=font(20, True), fill=(140, 160, 170), anchor='rm')
    img.save(WORK / name)


def captions(voices):
    """Legenda palavra a palavra: frase em grupos de até 6 palavras, a palavra falada em dourado."""
    f = font(54)
    items = []  # (início, fim, png)
    n = 0
    for start, key in voices:
        words = json.loads((OUT / 'voz' / f'{key}.json').read_text(encoding='utf-8'))['words']
        groups = [words[i:i + 6] for i in range(0, len(words), 6)]
        for g in groups:
            for j, word in enumerate(g):
                img = Image.new('RGBA', (1920, 140), (0, 0, 0, 0))
                d = ImageDraw.Draw(img)
                texts = [w['word'] for w in g]
                total = sum(f.getlength(t) for t in texts) + 22 * (len(texts) - 1)
                d.rounded_rectangle(((1920 - total) / 2 - 34, 18, (1920 + total) / 2 + 34, 122), 30, fill=(6, 8, 14, 190))
                x = (1920 - total) / 2
                for k, t in enumerate(texts):
                    d.text((x, 70), t, font=f, fill=GOLD if k == j else (245, 247, 255) if k < j else (160, 168, 190), anchor='lm')
                    x += f.getlength(t) + 22
                file = f'leg-{n:03d}.png'; n += 1
                img.save(WORK / file)
                end = g[j + 1]['start'] if j + 1 < len(g) else word['end'] + 0.25
                items.append((start + word['start'], start + end, file))
    return items


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    plan = [
        # História 1: bugs
        ('01.mp4', 'story-bugs.mp4', 0.3, 6.0, 8.4, SOL, (1.0, 1.1), (.4, .3)),
        ('02.mp4', 'story-bugs.mp4', 5.8, 8.0, 2.0, SOL, (1.1, 1.15), (.4, .4)),
        ('03.mp4', 'story-bugs.mp4', 8.0, 13.0, 2.0, FULL, (1.0, 1.06), (.5, .5)),
        ('04.mp4', 'story-bugs.mp4', 13.0, 16.2, 2.6, MENU, (1.0, 1.25), (.3, .25)),
        ('05.mp4', 'story-bugs.mp4', 16.2, 21.0, 2.0, FULL, (1.05, 1.0), (.5, .5)),
        ('06.mp4', 'story-bugs.mp4', 21.0, 31.0, 4.0, FULL, (1.0, 1.12), (.45, .4)),
        ('07.mp4', 'story-bugs.mp4', 31.0, 41.0, 2.5, FULL, (1.12, 1.0), (.5, .4)),
        ('08.mp4', 'story-bugs.mp4', 42.0, 46.0, 4.5, FULL, (1.0, 1.15), (.5, .5)),
        # História 2: YouTube
        ('09.mp4', 'story-youtube.mp4', 0.3, 4.6, 5.5, SOL, (1.0, 1.1), (.4, .3)),
        ('10.mp4', 'story-youtube.mp4', 4.4, 6.4, 2.0, SOL, (1.1, 1.15), (.4, .4)),
        ('11.mp4', 'story-youtube.mp4', 6.4, 14.0, 3.6, FULL, (1.0, 1.06), (.5, .5)),
        ('12.mp4', 'story-youtube.mp4', 14.0, 17.5, 2.6, FULL, (1.0, 1.1), (.5, .4)),
        ('13.mp4', 'story-youtube.mp4', 17.5, 20.0, 2.2, FULL, (1.0, 1.1), (.5, .5)),
        ('14.mp4', 'story-youtube.mp4', 20.0, 23.0, 2.4, FULL, (1.0, 1.12), (.5, .5)),
        ('15.mp4', 'story-youtube.mp4', 23.0, 27.0, 2.6, FULL, (1.25, 1.0), (.5, .5)),
    ]
    starts, t = [], 0.0
    for name, src, a, b, dur, crop, z, focus in plan:
        starts.append(t); t += dur
        shot(name, src, a, b, dur, crop, z, focus)
    end_at = t
    end_card('16.mp4', 5.0)
    total = end_at + 5.0
    files = sorted(WORK.glob('[0-9][0-9].mp4'))
    (WORK / 'lista.txt').write_text(''.join(f"file '{f.name}'\n" for f in files), encoding='utf-8')
    run(['-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'base.mp4'], cwd=WORK)

    # Sobreposições: balões, celular e legendas, com instantes absolutos.
    bubble('balao-1.png', 'Tudo bem, te aviso quando estiver pronto.')
    bubble('balao-2.png', 'Pronto! 7 bugs corrigidos em 4 arquivos.')
    bubble('balao-3.png', 'Claro! Vou montar tudo aqui no canvas.')
    phone('celular.png', 'Seu projeto está concluído. Quer que eu mande o resumo por aqui?')
    s = dict(zip([p[0] for p in plan], starts))
    story2 = s['09.mp4']
    voices = [(0.3, 'bugs'), (story2 + 0.2, 'youtube'), (end_at + 0.35, 'fim')]
    legs = captions(voices)
    overlays = [  # (png, início, fim, x, y, entrada)
        ('balao-1.png', s['02.mp4'], s['02.mp4'] + 2.0, '(W-w)/2', 'H*0.62', 'pop'),
        ('balao-2.png', s['07.mp4'] + 0.6, s['07.mp4'] + 2.5, '(W-w)/2', 'H*0.10', 'pop'),
        ('celular.png', s['08.mp4'] + 1.6, s['08.mp4'] + 4.5, 'W-w-140', 'H-h+20', 'slide'),
        ('balao-3.png', s['10.mp4'], s['10.mp4'] + 2.0, '(W-w)/2', 'H*0.62', 'pop'),
    ]
    inputs, chain, last = ['-i', 'base.mp4'], [], '0:v'
    for i, (png, a, b, x, y, kind) in enumerate(overlays, start=1):
        inputs += ['-loop', '1', '-t', f'{total}', '-i', png]
        if kind == 'slide':
            yexpr = f"'H-h+20+(h)*pow(max(0,1-(t-{a})/0.45),3)'"
            chain.append(f"[{last}][{i}:v]overlay=x={x}:y={yexpr}:enable='between(t,{a},{b})'[o{i}]")
        else:
            chain.append(f"[{i}:v]format=rgba,fade=t=in:st={a}:d=0.18:alpha=1,fade=t=out:st={b - 0.2}:d=0.2:alpha=1[p{i}];"
                         f"[{last}][p{i}]overlay=x={x}:y={y}:enable='between(t,{a},{b})'[o{i}]")
        last = f'o{i}'
    # Legendas: um fluxo de imagens com a duração de cada estado (concat demuxer).
    lines, cursor = [], 0.0
    blank = Image.new('RGBA', (1920, 140), (0, 0, 0, 0)); blank.save(WORK / 'leg-vazia.png')
    for a, b, png in legs:
        if a > cursor:
            lines += ["file 'leg-vazia.png'", f'duration {a - cursor:.3f}']
        lines += [f"file '{png}'", f'duration {b - a:.3f}']
        cursor = b
    lines += ["file 'leg-vazia.png'", f'duration {max(0.1, total - cursor):.3f}', "file 'leg-vazia.png'"]
    (WORK / 'legendas.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    k = len(overlays) + 1
    inputs += ['-f', 'concat', '-safe', '0', '-i', 'legendas.txt']
    chain.append(f"[{k}:v]format=rgba,fps={FPS}[leg];[{last}][leg]overlay=0:H-h-60:format=auto[v]")

    # Áudio: trilha com a narração por cima, abaixando a trilha quando alguém fala.
    inputs += ['-i', OUT / 'audio/trilha-historias.wav']
    music = k + 1
    voice_inputs = []
    for j, (start, key) in enumerate(voices):
        inputs += ['-i', OUT / 'voz' / f'{key}.mp3']
        voice_inputs.append((music + 1 + j, start))
    vparts = ''.join(f"[{idx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay={int(st * 1000)}|{int(st * 1000)},volume=1.6[v{n}];" for n, (idx, st) in enumerate(voice_inputs))
    vmix = ''.join(f'[v{n}]' for n in range(len(voice_inputs))) + f'amix=inputs={len(voice_inputs)}:dropout_transition=0,volume={len(voice_inputs)},asplit=2[voz][chave]'
    chain.append(vparts + vmix)
    chain.append(f"[{music}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.7[m];[m][chave]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[mduck];"
                 f"[mduck][voz]amix=inputs=2:dropout_transition=0,volume=1.5,afade=t=out:st={total - 1.5}:d=1.5,alimiter=limit=0.89,volume=0.85[a]")
    output = OUT / 'Zenite-comercial-historias.mp4'
    run([*inputs, '-filter_complex', ';'.join(chain), '-map', '[v]', '-map', '[a]', '-t', f'{total}', '-r', FPS,
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '224k',
         '-movflags', '+faststart', output], cwd=WORK)
    print(output, f'{total:.1f}s')


if __name__ == '__main__':
    main()
