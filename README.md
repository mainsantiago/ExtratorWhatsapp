# Extrator de Conversas para WhatsApp Web

Extensão do Google Chrome (Manifest V3) que exporta **todas** as conversas do WhatsApp Web com 1 clique. Gera um arquivo por conversa com o número, o nome, a data e a hora de cada mensagem, dos dois lados da conversa.

Requisitos e decisões: [`docs/BRD.md`](docs/BRD.md) · Resultado do spike técnico: [`docs/spike.md`](docs/spike.md)

## Instalar sem a loja (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ative **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta **`extension/`** deste repositório.
4. Fixe o ícone da extensão na barra (ícone de quebra-cabeça → alfinete).
5. Abra ou recarregue `https://web.whatsapp.com` e faça login.

Depois de alterar o código, clique no ícone ↻ do card da extensão em `chrome://extensions` e recarregue a aba do WhatsApp Web.

## Usar

1. Com o WhatsApp Web aberto e as conversas carregadas, clique no ícone da extensão.
2. Clique em **Extrair todas as conversas**.
3. Acompanhe o progresso no popup ou no painel no canto da página. Ao terminar, o Chrome baixa `whatsapp-conversas_AAAA-MM-DD_HHMM.zip`.

### Opções
- **Preservar conversas não lidas** (ligada por padrão): não abre conversas com mensagens não lidas.
- **Aprofundar histórico:** em cada conversa, rola até o início para trazer mensagens antigas que ainda não estão na tela. É bem mais lento.
- **Relatório de diagnóstico:** baixa um JSON só com a estrutura encontrada (nomes de tabelas e campos, contagens), **sem conteúdo de mensagens**. Use esse relatório para ajustar a extensão quando o WhatsApp Web mudar.

## O que vem no .zip

```
whatsapp-conversas_2026-11-19_1430/
├── indice.csv                  # uma linha por conversa: total, enviadas, recebidas, período
├── resumo.json                 # totais, período, motor usado
├── erros.log                   # só se houve ocorrências
└── conversas/
    ├── Joao Silva_5511999998888.csv
    ├── Joao Silva_5511999998888.json
    └── Equipe Vendas_120363000000.csv / .json
```

O CSV é UTF-8 com BOM, separado por `;`, e abre direto no Excel em português.

| Coluna | Conteúdo |
|---|---|
| conversa_id, conversa_nome, conversa_tipo | Identificação da conversa (individual / grupo) |
| mensagem_id | ID único da mensagem |
| data, hora, timestamp_utc | Data e hora locais e o instante em UTC |
| direcao | `enviada`, `recebida` ou `sistema` (avisos do WhatsApp) |
| remetente_numero, remetente_nome | Quem enviou (em grupos, o participante) |
| destinatario_numero | Para quem (em grupos, o ID do grupo) |
| tipo | texto, imagem, audio, video, documento, figurinha, localizacao, contato, apagada, sistema… |
| texto | Texto da mensagem ou legenda da mídia |
| resposta_a, encaminhada | Mensagem citada e se foi encaminhada |
| numero_oculto | `sim` quando o WhatsApp oculta o número do participante (ID LID) |
| texto_disponivel | `não` quando a conversa não foi aberta (não lida preservada) ou a mensagem não carregou na tela |
| origem | `local`, `tela` ou `local+tela` |

## Como funciona

Funciona no WhatsApp Web **pessoal e Business**, que usam o mesmo `web.whatsapp.com`.

| Etapa | O que faz |
|---|---|
| 1. Base local | Lê o que o WhatsApp Web guarda no navegador: contatos, grupos, números ocultos (LID) e os metadados das mensagens. O **texto** fica cifrado ali. |
| 2. Tela | Abre cada conversa da lista, uma por vez, lê os balões (o texto aparece decifrado) e fecha ao final. |
| 3. Cruzamento | Relê a base local e junta tudo pelo ID da mensagem: texto da tela + número, data com segundos e direção da base local. |
| 4. Empacotamento | Gera o .zip no próprio navegador, sem bibliotecas externas. |

Durante a extração, não use o WhatsApp Web nessa aba, porque a extensão está abrindo as conversas.

**Conversas não lidas:** abrir uma conversa pode marcá-la como lida. Por isso a opção "Preservar conversas não lidas" vem ligada: essas conversas não são abertas e saem só com data, hora e remetente (`texto_disponivel = não`). Para incluir o texto delas, desligue a opção. Se você desativar "Confirmações de leitura" nas configurações de privacidade do WhatsApp, o contato não verá os tiques azuis nas conversas individuais (em grupos eles continuam sendo enviados).

Toda dependência da estrutura interna do WhatsApp Web está isolada em `extension/src/adapters/` (`idb.js` e `dom.js`). Quando uma atualização do WhatsApp quebrar a extração, o ajuste é feito ali.

Privacidade: a extensão não faz nenhuma requisição de rede e só pede acesso a `https://web.whatsapp.com/*`.

## Testes

```bash
node tests/run-tests.js
```

Os testes cobrem: formatação, CSV, zip (validado com `unzip`), normalização (individual, grupo, número oculto LID, mídias), empacotamento, o fluxo completo com um WhatsApp simulado, e regras da loja (sem código remoto, sem chamadas de rede, permissões mínimas).

## Publicar na Chrome Web Store

1. Atualize `version` em `extension/manifest.json` (cada envio precisa de uma versão maior).
2. Gere o pacote: `./scripts/package.sh` → `dist/extrator-conversas-vX.Y.Z.zip`.
3. Crie a conta de desenvolvedor no [Painel do Chrome Web Store](https://chrome.google.com/webstore/devconsole) (taxa única de registro).
4. Publique a política de privacidade (`store/politica-de-privacidade.md`) em uma URL pública, por exemplo no GitHub Pages.
5. Envie o .zip e preencha a listagem com os textos e respostas prontos em [`store/listagem-chrome-web-store.md`](store/listagem-chrome-web-store.md).
6. Adicione de 1 a 5 capturas de tela de 1280×800, sem dados reais visíveis.

## Estrutura

```
extension/            ← pasta carregada no Chrome e empacotada para a loja
  manifest.json
  popup/              botão, opções, progresso, resumo
  src/lib/            formatação, CSV, ZIP
  src/adapters/       idb.js (dados locais) e dom.js (tela) — dependências do WhatsApp
  src/core/           normalização, extração, empacotamento
  src/ui/overlay.js   painel de progresso na página
  src/content.js      recebe os comandos do popup
  icons/
docs/                 BRD e spike
store/                política de privacidade, textos e imagens da loja
scripts/package.sh    gera o .zip para a loja
tests/run-tests.js    testes automatizados
```
