"""Comercial curto (40 s) a partir das capturas reais do aplicativo.

Cortes no compasso da trilha (120 BPM, compassos de 2 s), câmera feita na edição
(aproximar e deslizar sobre gravações em alta resolução) e tipografia grande entre
os planos. Nenhum quadro é gerado: todo plano de interface vem de out/comercial-zenite/raw.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'out/comercial-zenite'
RAW = OUT / 'raw'
WORK = OUT / 'spot'
FFMPEG = ROOT / 'out/video-tools/package/ffmpeg.exe'
FPS = 25
BOLD = 'C\\:/Windows/Fonts/seguisb.ttf'
REGULAR = 'C\\:/Windows/Fonts/segoeui.ttf'
LIGHT = 'C\\:/Windows/Fonts/segoeuil.ttf'
BG = '0x07090f'
# Recorte 16:9 das tomadas do canvas gigante (1904×994) e das antigas (1600×900).
SPOT = (68, 0, 1767, 994)
FULL = (0, 0, 1600, 900)


def run(args, cwd=None):
    subprocess.run([str(FFMPEG), '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], check=True, cwd=cwd)


def encode(name):
    return ['-an', '-r', FPS, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', WORK / name]


def esc(text):
    return text.replace('\\', '\\\\').replace(':', '\\:').replace("'", "’").replace('%', '\\%')


def headline(text, size, y, start=0.0, font=BOLD, color='white'):
    """Texto que sobe 30 px e aparece em 0,3 s."""
    return (f"drawtext=fontfile='{font}':text='{esc(text)}':fontsize={size}:fontcolor={color}:x=(w-text_w)/2:"
            f"y={y}+30*exp(-9*max(t-{start}\\,0)):alpha='min(1\\,max(0\\,(t-{start})*3.4))'")


def shot(name, src, start, dur, speed=1.0, crop=SPOT, z=(1.0, 1.15), focus=((.5, .5), (.5, .5)), overlay=''):
    """Plano de interface: recorte 16:9, ampliado e com câmera lenta de aproximação."""
    x, y, w, h = crop
    frames = round(dur * FPS)
    (fx0, fy0), (fx1, fy1) = focus
    p = f'(on/{frames})'
    ease = f'(3*{p}*{p}-2*{p}*{p}*{p})'  # suaviza o início e o fim do movimento
    zoom = f'{z[0]}+({z[1]}-{z[0]})*{ease}'
    fx, fy = f'({fx0}+({fx1}-{fx0})*{ease})', f'({fy0}+({fy1}-{fy0})*{ease})'
    chain = [f'setpts=PTS/{speed}', f'fps={FPS}', f'crop={w}:{h}:{x}:{y}', 'scale=3840:2160:flags=lanczos',
             f"zoompan=z='{zoom}':x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*{fy}':d=1:s=1920x1080:fps={FPS}",
             'eq=contrast=1.06:saturation=1.12', f'fade=t=in:st=0:d=0.12']
    if overlay:
        chain += ["drawbox=x=0:y=ih*0.62:w=iw:h=ih*0.38:color=black@0.55:t=fill", overlay]
    run(['-ss', start, '-i', RAW / src, '-vf', ','.join(chain), '-frames:v', frames, *encode(name)])


def card(name, dur, lines, backdrop='spot-wide.mp4', at=1.0):
    """Tela de texto sobre o próprio canvas, desfocado e escuro."""
    frames = round(dur * FPS)
    x, y, w, h = SPOT
    chain = [f'crop={w}:{h}:{x}:{y}', 'scale=1920:1080', 'gblur=sigma=18', 'eq=brightness=-0.2:saturation=0.85',
             f"zoompan=z='1.08-0.06*on/{frames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=1920x1080:fps={FPS}",
             'vignette=PI/3.2', *lines, 'fade=t=in:st=0:d=0.15']
    run(['-stream_loop', '-1', '-ss', at, '-i', RAW / backdrop, '-vf', ','.join(chain), '-frames:v', frames, *encode(name)])


def end_card(name, dur):
    frames = round(dur * FPS)
    graph = (f"[0:v]drawgrid=w=120:h=120:t=1:c=0x8ea2ff@0.05,vignette=PI/3[bg];"
             f"[1:v]scale=200:200,format=rgba,fade=t=in:st=0.1:d=0.5:alpha=1[logo];"
             f"[bg][logo]overlay=(W-w)/2:250+20*exp(-6*t)[v];"
             f"[v]{headline('Zênite', 132, 470, 0.25)},"
             f"{headline('Vários agentes. Um só espaço.', 48, 640, 0.6, REGULAR, '0xc9d2ff')},"
             f"{headline('Grátis para Windows  ·  github.com/Nata-Felix/O', 30, 790, 1.1, REGULAR, '0x8796bc')},"
             f"fade=t=out:st={dur - 1.2}:d=1.2[out]")
    run(['-f', 'lavfi', '-i', f'color=c={BG}:s=1920x1080:r={FPS}:d={dur}', '-loop', '1', '-i', ROOT / 'build/icon.png',
         '-filter_complex', graph, '-map', '[out]', '-frames:v', frames, *encode(name)])


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    # Agentes: Sol (esquerda) e Construtor (direita) na gravação real do Codex, acelerada.
    agents = (500, 95, 960, 540)
    plan = [
        lambda: card('01-abre.mp4', 4, [headline('Seu projeto inteiro.', 120, 450, 0.2)]),
        lambda: shot('02-canvas.mp4', 'spot-wide-ui.mp4', 0.5, 6, z=(1.0, 1.32), focus=((.5, .45), (.62, .35))),
        lambda: card('03-agentes.mp4', 2, [headline('Vários agentes.', 120, 450, 0.05)], at=3),
        lambda: shot('04-sol.mp4', 'agents.mp4', 16, 2, speed=6, crop=agents, z=(1.15, 1.35), focus=((.1, .3), (.15, .3))),
        lambda: shot('05-codex.mp4', 'agents.mp4', 64, 2, speed=6, crop=agents, z=(1.15, 1.35), focus=((.9, .3), (.85, .3))),
        lambda: shot('06-git.mp4', 'spot-git.mp4', 1, 2, z=(1.25, 1.45), focus=((.42, .45), (.45, .42))),
        lambda: card('07-dados.mp4', 2, [headline('Tudo ao vivo.', 120, 450, 0.05)], at=2),
        lambda: shot('08-admin.mp4', 'spot-admin.mp4', 0.5, 4, z=(1.05, 1.5), focus=((.5, .5), (.62, .3))),
        lambda: shot('09-sistema.mp4', 'spot-system.mp4', 1, 1, z=(1.3, 1.4), focus=((.45, .45), (.45, .45))),
        lambda: shot('10-servidor.mp4', 'spot-server.mp4', 1, 1, z=(1.3, 1.4), focus=((.35, .45), (.35, .45))),
        lambda: shot('11-checks.mp4', 'spot-checks.mp4', 1, 1, z=(1.3, 1.4), focus=((.45, .4), (.45, .4))),
        lambda: shot('12-fluxo.mp4', 'spot-flow.mp4', 0.5, 1, z=(1.1, 1.2), focus=((.6, .45), (.6, .45))),
        lambda: shot('13-ligacoes.mp4', 'connections.mp4', 3.0, 1, crop=(380, 180, 640, 360), z=(1.0, 1.1)),
        lambda: shot('14-sprint.mp4', 'spot-sprint.mp4', 0.5, 1, z=(1.15, 1.25), focus=((.5, .45), (.5, .45))),
        lambda: card('15-conectado.mp4', 2, [headline('Tudo conectado.', 120, 450, 0.05)], at=3),
        lambda: shot('16-volta.mp4', 'spot-wide.mp4', 1, 4, z=(1.6, 1.0), focus=((.5, .3), (.5, .5)),
                     overlay=headline('Um só espaço para trabalhar.', 72, 820, 1.2)),
        lambda: end_card('17-fim.mp4', 4),
    ]
    for step in plan:
        step()
    files = sorted(WORK.glob('[0-9][0-9]-*.mp4'))
    (WORK / 'lista.txt').write_text(''.join(f"file '{f.name}'\n" for f in files), encoding='utf-8')
    output = OUT / 'Zenite-comercial-40s.mp4'
    run(['-f', 'concat', '-safe', '0', '-i', WORK / 'lista.txt', '-i', OUT / 'audio/trilha-spot.wav', '-map', '0:v', '-map', '1:a',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '224k', '-shortest', '-movflags', '+faststart', output], cwd=WORK)
    print(output)


if __name__ == '__main__':
    main()
