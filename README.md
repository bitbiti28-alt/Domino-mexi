# Placar de Dominó Mexicano

App web (funciona no celular, inclusive offline) para marcar a pontuação do **Dominó Mexicano / Trem Mexicano**.

## Como usar

1. Cadastre os nomes dos jogadores e escolha o duplo inicial (6, 9, 12 ou 15).
2. A cada rodada (do duplo mais alto até o duplo zero), lance os pontos de cada jogador:
   - **📷** — tire uma foto das pedras que sobraram na mão; o app conta os pontos automaticamente.
     Na revisão, toque num ponto marcado para removê-lo, ou num ponto esquecido para adicioná-lo.
   - **Bateu** — o jogador que ficou sem pedras marca 0.
   - Ou digite o valor direto no campo.
3. **Fechar rodada** passa para o próximo duplo. O placar mostra o total de cada um — **menor total vence**.

Opção: “Duplo zero vale 50 pontos” — mostra uma caixinha na tela da foto para somar +50.

O jogo fica salvo no aparelho (localStorage), então dá para fechar e voltar depois.

## Dicas para a foto

- Espalhe as pedras **viradas para cima sobre uma superfície escura ou colorida** (mesa, pano, toalha), sem encostar umas nas outras.
- Fotografe de cima, com boa luz e sem reflexo forte.
- Funciona com pontos pretos ou coloridos (pedras de Trem Mexicano).

A contagem roda inteiramente no navegador (nenhuma foto é enviada a servidor). Ela conta os “buracos” redondos
dentro das pedras brancas, por isso uma mesa branca atrapalha. Sempre confira o número antes de confirmar.

## Rodando

Não há build. Basta servir a pasta por HTTP, por exemplo:

```sh
python3 -m http.server 8000
```

e abrir `http://localhost:8000`. Para usar no celular, publique no **GitHub Pages**
(Settings → Pages → Deploy from branch) e, no navegador do celular, use “Adicionar à tela inicial”.
A câmera exige HTTPS (o GitHub Pages já fornece).

## Arquivos

- `index.html`, `style.css`, `app.js` — interface e placar
- `detector.js` — detecção dos pontos na foto
- `sw.js`, `manifest.webmanifest`, `icon.svg` — instalação como app e uso offline
