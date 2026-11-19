# Spike técnico — como o WhatsApp Web guarda as conversas

## Rodada 1 — 19/11/2026, Chrome não logado
- O navegador interno do app Claude é recusado pelo WhatsApp Web ("works with Google Chrome 100+"). Testes feitos no Chrome.
- A base IndexedDB `model-storage` tem as tabelas `message`, `chat`, `contact`, `group-metadata` e `lid-pn-mapping`.

## Rodada 2 — 19/11/2026, WhatsApp **Business** logado (após a 1ª extração do patrocinador)
Somente estrutura, nomes de campos e contagens. Nenhum conteúdo de mensagem foi lido.

| Constatação | Consequência |
|---|---|
| A tabela `message` tinha só **6 registros**. O WhatsApp não guarda o histórico inteiro localmente: grava os metadados das conversas conforme elas são abertas. | Ler só a base local não basta. |
| O registro de mensagem **não tem `body`**. O conteúdo fica em `msgRowOpaqueData` (**cifrado**). | O texto só existe decifrado **na tela**. |
| Na tela, `data-id` agora é **só o ID da mensagem** (antes era `false_<jid>_<id>`). | O leitor de tela da v1.0.0 descartava todas as linhas. Corrigido. |
| O ID da tela **é igual** ao ID da base local (6 de 6 cruzaram). | Cruzamento por ID: texto da tela + número, data com segundos e direção da base local. |
| O clique simples não abre a conversa. A sequência completa de eventos de ponteiro + mouse abre. | `pointerClick()` em `dom.js`. |
| O lado do balão (posição na tela) bateu 100% com `fromMe` da base local. | Usado como reserva quando a mensagem não está na base local. |
| `data-pre-plain-text` no formato `[HH:MM, DD/MM/AAAA] Autor: `. | Data, hora e autor das mensagens só da tela. |
| Mensagens de empresa (tipo `biz_content_placeholder`, modelos, botões) não têm o campo de texto padrão. | Leitura alternativa do texto do balão. |
| Número do próprio usuário em `localStorage['last-wid-md']`. | Mensagens enviadas saem com o seu número. |
| Esc fecha a conversa aberta. | A extensão fecha a conversa ao terminar. |

O WhatsApp pessoal e o Business usam o mesmo cliente (`web.whatsapp.com`) e o mesmo armazenamento. A diferença observada é só o título da aba ("WhatsApp Business") e os tipos de mensagem de empresa.

## Decisão (v1.1.0)
1. Lê da base local os contatos, grupos, números ocultos (LID) e metadados.
2. Abre cada conversa da lista, lê os balões e fecha ao final.
3. Relê a base local (agora com os metadados das conversas abertas) e cruza pelo ID.
4. "Preservar conversas não lidas" (ligado por padrão): não abre conversas com mensagens não lidas, para não marcá-las como lidas.

Validação no WhatsApp real (Business, 2 conversas): ambas abriram, 6/6 mensagens cruzaram com a base local e 100% dos lados conferiram.
