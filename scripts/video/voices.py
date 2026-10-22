"""Narração do comercial com vozes neurais (edge-tts) e o tempo de cada palavra.

Só o texto das falas abaixo é enviado ao serviço de voz. Gera out/comercial-zenite/voz/<id>.mp3
e <id>.json com as palavras e seus instantes, usados na legenda palavra a palavra.
"""
from pathlib import Path
import asyncio
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'out/video-tools/python'))
import edge_tts

OUT = ROOT / 'out/comercial-zenite/voz'
LINES = {
    'bugs': ('pt-BR-AntonioNeural', 'Sol, me avise quais bugs você encontrar no projeto e anote na tabela Bugs. Depois vá corrigindo e marque o que conseguiu corrigir.'),
    'youtube': ('pt-BR-FranciscaNeural', 'Oi, Sol! Me ajuda a fazer o roteiro do meu vídeo, com thumb, e analisar meu canal do YouTube?'),
    'fim': ('pt-BR-AntonioNeural', 'Zênite. Seus agentes, trabalhando juntos, num só lugar.'),
}


async def speak(key, voice, text):
    words = []
    with open(OUT / f'{key}.mp3', 'wb') as audio:
        async for chunk in edge_tts.Communicate(text, voice, rate='+8%', boundary='WordBoundary').stream():
            if chunk['type'] == 'audio':
                audio.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                words.append({'word': chunk['text'], 'start': chunk['offset'] / 1e7, 'end': (chunk['offset'] + chunk['duration']) / 1e7})
    (OUT / f'{key}.json').write_text(json.dumps({'text': text, 'words': words}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(key, f'{words[-1]["end"]:.2f}s', len(words), 'palavras')


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (voice, text) in LINES.items():
        await speak(key, voice, text)

asyncio.run(main())
