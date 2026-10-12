# Placar de Dominó Mexicano

App web (funciona no celular, inclusive offline) para marcar a pontuação do **Dominó Mexicano / Trem Mexicano**.

## Como usar

1. Cadastre os nomes dos jogadores e escolha o duplo inicial (6, 9, 12 ou 15).
   O jogo vai do duplo inicial até o duplo zero (duplo 12 = 13 rodadas);
   desmarque “Jogar também a rodada do duplo zero” para terminar no duplo 1.
2. A cada rodada, lance os pontos de cada jogador:
   - **📷** — tire uma foto das pedras que sobraram na mão; o app conta os pontos automaticamente.
     Na revisão, toque num ponto marcado para removê-lo, ou num ponto esquecido para adicioná-lo.
   - **Bateu** — o jogador que ficou sem pedras marca 0.
   - Ou digite o valor direto no campo.
3. **Fechar rodada** passa para o próximo duplo. O placar mostra o total de cada um — **menor total vence**.

Regra do duplo zero: se a única pedra que sobrou na mão for o duplo zero, ela vale 100 pontos.
Marque “Só sobrou o duplo zero” na tela da foto (ou digite 100). A regra pode ser desligada na tela inicial.

O jogo fica salvo no aparelho (localStorage), então dá para fechar e voltar depois.

## Dicas para a foto

- Deixe as pedras **viradas para cima**, com a **linha do meio visível**, sobre uma superfície escura ou colorida
  (mesa, pano, toalha) — ou na mão.
- Fotografe de cima, com boa luz e sem reflexo forte.
- Funciona com pontos pretos, cinza ou coloridos (pedras de Trem Mexicano).

A contagem roda inteiramente no navegador (nenhuma foto é enviada a servidor). O app acha a linha do meio de cada
pedra e só conta as bolinhas dentro dela, então cartas, naipes da toalha, a mão e sujeiras pequenas não entram.
Uma mesa branca atrapalha. Sempre confira o número antes de confirmar.

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
