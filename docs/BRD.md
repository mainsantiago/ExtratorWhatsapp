# BRD — Extrator WhatsApp Web (Extensão Chrome)

| Campo | Valor |
|---|---|
| Documento | Business Requirements Document (BRD) |
| Projeto | ExtratorWhatsapp |
| Versão | 1.1 (revisão técnica após o 1º teste real; ver §16) |
| Data | 19/11/2026 |
| Status | **Aprovado** em 19/11/2026 — desenvolvimento liberado |

---

## 1. Contexto e problema

Hoje não existe forma nativa de exportar **todas** as conversas do WhatsApp Web de uma vez. A função "Exportar conversa" do app no celular funciona uma conversa por vez, gera `.txt` sem estrutura e não traz o número de telefone de forma consistente (principalmente em grupos).

O usuário precisa de um meio rápido, com **1 clique**, para gerar um arquivo estruturado de cada conversa, com quem falou, quando falou e de qual lado da conversa.

## 2. Objetivo de negócio

Permitir que o usuário, com o WhatsApp Web aberto no Chrome, clique em um único botão e receba um pacote com **todas as conversas separadas por arquivo**, contendo para cada mensagem: número, nome, data, hora e direção (enviada/recebida).

### Indicadores de sucesso
| Indicador | Meta |
|---|---|
| Ações do usuário para extrair tudo | 1 clique (+ confirmação de download do Chrome, se ativa) |
| Conversas exportadas vs. conversas visíveis na lista | ≥ 99% |
| Mensagens com data/hora preenchidas | 100% |
| Mensagens com número do remetente identificado | ≥ 95% (ver risco R2 — IDs ocultos/LID) |
| Tempo para 100 conversas / 20 mil mensagens | < 2 minutos (abordagem principal) |
| Dados enviados para servidores externos | Zero |

## 3. Escopo

### 3.1 Dentro do escopo
- Extensão Chrome (Manifest V3) ativa apenas em `https://web.whatsapp.com/*`.
- Botão "Extrair todas as conversas" no popup da extensão.
- Extração de conversas individuais **e** de grupos.
- Para cada mensagem: ID, data, hora, timestamp, direção, número e nome do remetente, tipo e texto.
- Um arquivo por conversa, empacotados em um único `.zip`, mais um índice geral.
- Barra de progresso e resumo final (conversas, mensagens, falhas).
- Processamento 100% local no navegador.

### 3.2 Fora do escopo (versão 1)
- Download de mídias (fotos, áudios, vídeos, documentos) — só o registro de que existiram e o nome do arquivo/legenda quando houver.
- Envio de mensagens, automação de respostas ou qualquer escrita no WhatsApp.
- Sincronização com nuvem, banco de dados ou API externa.
- Agendamento automático de extrações.
- Suporte a outros navegadores (Edge/Brave provavelmente funcionam por serem Chromium, mas não serão homologados).
- Recuperar mensagens que o WhatsApp Web ainda não sincronizou do celular.

## 4. Partes interessadas

| Papel | Responsabilidade |
|---|---|
| Patrocinador / usuário final | Aprovar o BRD, validar os arquivos gerados |
| Desenvolvedor | Implementar, testar e documentar a extensão |

## 5. Requisitos funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| RF01 | O popup exibe um botão único "Extrair todas as conversas". | Must |
| RF02 | Se a aba ativa não for o WhatsApp Web, ou se não estiver logado, a extensão informa e oferece abrir `web.whatsapp.com`. | Must |
| RF03 | A extração percorre **todas** as conversas (individuais, grupos e arquivadas) sem que o usuário precise abri-las. | Must |
| RF04 | Cada mensagem registra os campos do dicionário de dados (seção 7). | Must |
| RF05 | Mensagens dos **dois lados** são capturadas; enviadas pelo usuário recebem direção `enviada` e o número/nome do próprio usuário. | Must |
| RF06 | Em grupos, cada mensagem identifica o participante que a enviou (número + nome). | Must |
| RF07 | O resultado é um único `.zip` com uma pasta/arquivo por conversa e um `indice.csv` geral. | Must |
| RF08 | Formatos por conversa: CSV (UTF-8 com BOM, separador `;`, abre direto no Excel pt-BR) e JSON. | Must |
| RF09 | Nome do arquivo: `<nome-da-conversa>_<numero-ou-id>.csv`, saneado para caracteres válidos e sem colisões. | Must |
| RF10 | Barra de progresso com conversa atual, total e contagem de mensagens; botão Cancelar. | Should |
| RF11 | Ao final, resumo: nº de conversas, nº de mensagens, período coberto, conversas com falha. | Should |
| RF12 | Opção de filtro por período (data inicial/final) — fica recolhida para não quebrar o "1 clique". | Could |
| RF13 | Modo "aprofundar histórico": rola cada conversa para forçar o WhatsApp a carregar mensagens antigas ainda não sincronizadas. | Should |
| RF14 | Formato XLSX consolidado (uma aba por conversa). | Could |
| RF15 | **Instalação fora da loja:** a extensão funciona carregada como "sem compactação" (modo desenvolvedor), a partir da pasta do repositório. | Must |
| RF17 | Funciona no WhatsApp Web **pessoal e Business**. | Must |
| RF18 | Opção "Preservar conversas não lidas" (ligada por padrão): não abre conversas com mensagens não lidas. | Must |
| RF16 | **Pronta para a Chrome Web Store:** o mesmo código é empacotado em `.zip` de publicação, com ícones (16/32/48/128), política de privacidade, textos da listagem e justificativa de cada permissão. | Must |

## 6. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | **Privacidade:** nenhum dado sai do computador. Sem analytics, sem chamadas de rede da extensão. |
| RNF02 | **Permissões mínimas** no manifesto: `activeTab`/host `web.whatsapp.com`, `downloads`, `storage`. Nada de `<all_urls>`. |
| RNF03 | **Somente leitura:** a extensão não altera, apaga nem marca mensagens como lidas. |
| RNF04 | **Desempenho:** não travar a interface do WhatsApp; processamento em lotes com `await` entre eles. |
| RNF05 | **Resiliência:** falha em uma conversa não interrompe as demais; erro vai para `erros.log` dentro do zip. |
| RNF06 | **Manutenibilidade:** seletores e nomes de campos internos isolados em um único módulo (`adapters/`), porque o WhatsApp Web muda com frequência. |
| RNF07 | **Sem dependências externas em tempo de execução** (sem CDN). Bibliotecas, se houver, embutidas no pacote. |
| RNF08 | Fuso horário: datas exportadas no fuso local do navegador, com o timestamp UTC original preservado. |
| RNF09 | Idioma da interface: português (Brasil). |
| RNF10 | **Conformidade com a Chrome Web Store:** Manifest V3, nenhum código remoto (todo JS no pacote), propósito único declarado, sem ofuscação, permissões mínimas justificadas, divulgação de uso de dados coerente com a política de privacidade. |
| RNF11 | **Versionamento:** `version` do manifesto segue SemVer (1.0.0, 1.0.1…); cada envio à loja incrementa a versão. |

## 7. Dicionário de dados (por mensagem)

| Campo | Tipo | Exemplo | Observação |
|---|---|---|---|
| `conversa_id` | texto | `5511999998888@c.us` | ID interno da conversa |
| `conversa_nome` | texto | `João Silva` | Nome salvo, nome do perfil ou do grupo |
| `conversa_tipo` | texto | `individual` / `grupo` | |
| `mensagem_id` | texto | `3EB0A1B2C3...` | Para deduplicação |
| `data` | texto | `19/11/2026` | dd/mm/aaaa |
| `hora` | texto | `14:32:05` | hh:mm:ss |
| `timestamp_utc` | ISO 8601 | `2026-11-19T17:32:05Z` | |
| `direcao` | texto | `enviada` / `recebida` | |
| `remetente_numero` | texto | `+55 11 99999-8888` | E.164 formatado; vazio se oculto (ver R2) |
| `remetente_nome` | texto | `João Silva` | Contato salvo > nome do perfil > número |
| `destinatario_numero` | texto | `+55 11 98888-7777` | Em grupo: ID do grupo |
| `tipo` | texto | `texto`, `imagem`, `audio`, `video`, `documento`, `figurinha`, `localizacao`, `contato`, `sistema`, `apagada` | |
| `texto` | texto | `Bom dia!` | Corpo ou legenda da mídia |
| `resposta_a` | texto | `3EB0...` | ID da mensagem citada, se houver |
| `encaminhada` | sim/não | `não` | |

**Índice geral (`indice.csv`):** conversa, tipo, número/ID, total de mensagens, primeira e última mensagem, arquivo gerado.

> O campo `texto` foi confirmado na decisão Q1 (seção 14).

## 8. Abordagem técnica proposta

O WhatsApp Web mantém as conversas sincronizadas localmente no navegador. Há três caminhos para lê-las:

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. IndexedDB local** (recomendada como principal) | Ler as bases que o próprio WhatsApp Web grava no navegador (conversas, contatos, mensagens) | Muito rápido; não abre conversa por conversa; não mexe na tela; "1 clique" real | Estrutura interna não documentada; parte do conteúdo pode estar cifrada ou ausente; só vê o que já foi sincronizado |
| **B. Leitura da tela (DOM)** (fallback) | Abrir cada conversa, rolar para cima e ler os balões (`data-id`, `data-pre-plain-text`) | Usa só o que está visível; robusto para data/hora e nome | Lento (minutos a horas); muda a conversa ativa; frágil a mudanças de layout |
| C. Módulos internos do WhatsApp (estilo wa-js) | Acessar o "Store" interno via webpack | O mais completo | Mais frágil, quebra a cada atualização; maior exposição a bloqueio da conta |

**Proposta:** A como motor principal, B como fallback automático para conversas que A não conseguir ler por completo. C descartada pelo risco.

Antes do desenvolvimento completo, faço um **spike de 1 dia** no seu WhatsApp Web (via navegador, só leitura) para confirmar quais campos a opção A realmente entrega hoje — data/hora, número, nome, texto. O resultado do spike pode mudar a recomendação.

### Arquitetura (MV3)
```
manifest.json
popup/            → botão, progresso, resumo
background/       → service worker: orquestra, gera o zip, dispara o download
content/          → roda na página do WhatsApp; lê IndexedDB e/ou DOM
content/adapters/ → toda dependência de estrutura interna isolada aqui (RNF06)
lib/zip.js        → gerador de zip próprio, sem dependência externa
```

## 9. Premissas
1. O usuário está logado no WhatsApp Web no Chrome desktop e o celular sincronizou o histórico.
2. Primeiro a extensão é usada em modo desenvolvedor ("Carregar sem compactação"); em seguida é publicada na Chrome Web Store. O envio à loja (conta de desenvolvedor, taxa única de registro e revisão do Google) é feito pelo patrocinador com o pacote e os textos entregues pelo projeto.
3. Uso pessoal/interno, sobre a própria conta do usuário.

## 10. Restrições
- O WhatsApp Web não tem API pública para isso; qualquer extração depende da estrutura interna, que pode mudar sem aviso.
- O WhatsApp Web normalmente guarda localmente apenas parte do histórico (tipicamente os meses mais recentes); o que não está sincronizado não é exportável sem o modo RF13.

## 11. Riscos

| ID | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Atualização do WhatsApp Web muda a estrutura interna e quebra a extração | Alto | Adaptadores isolados (RNF06), fallback DOM, testes de fumaça documentados |
| R2 | WhatsApp passou a usar identificadores ocultos (LID) em vez do número em parte dos grupos/contatos | Médio | Resolver LID → número via tabela de contatos; quando impossível, exportar o LID e marcar `numero_oculto` |
| R3 | Termos de Uso do WhatsApp restringem meios automatizados | Médio | Somente leitura, sem automação de envio, sem acesso a servidores do WhatsApp, execução sob comando do usuário |
| R4 | LGPD: o arquivo exportado contém dados pessoais de terceiros | Médio | Processamento local; aviso no popup sobre guarda e compartilhamento do arquivo |
| R5 | Volume grande (centenas de milhares de mensagens) estoura memória | Médio | Geração por streaming/lotes; zip montado incrementalmente |
| R6 | Histórico incompleto no navegador | Baixo/Médio | Informar período coberto no resumo; modo RF13 opcional |
| R8 | Para ler o texto é preciso abrir cada conversa, o que pode enviar confirmação de leitura | Médio | RF18 ligado por padrão; orientação para desativar "Confirmações de leitura"; RNF03 passa a valer integralmente só com RF18 ligado |
| R7 | Revisão da Chrome Web Store recusa ou demora (extensões que leem dados de outros sites passam por revisão mais rigorosa) | Médio | RNF10; política de privacidade clara; propósito único; sem código remoto; sem injeção no contexto da página; justificativas por permissão |

## 12. Critérios de aceite
1. Com 1 clique no popup, um `.zip` é baixado contendo `indice.csv` e um arquivo por conversa.
2. Para uma amostra de 5 conversas (3 individuais, 2 grupos), as mensagens no CSV conferem com a tela em: data, hora, direção, nome e número do remetente.
3. Mensagens enviadas e recebidas aparecem na mesma conversa, em ordem cronológica.
4. O CSV abre no Excel pt-BR com acentuação correta e colunas separadas.
5. Nenhuma requisição de rede é feita pela extensão (verificável no DevTools).
6. A extração não altera o estado das conversas (nada marcado como lido).
7. A extensão carrega sem erros em `chrome://extensions` via "Carregar sem compactação".
8. O script de empacotamento gera o `.zip` de publicação, e a pasta `store/` contém política de privacidade, textos da listagem e justificativas de permissão.

## 13. Plano de entrega

| Etapa | Entrega |
|---|---|
| 0 | Aprovação deste BRD e respostas às questões abertas |
| 1 | Spike técnico: validar opção A no seu WhatsApp Web |
| 2 | MVP: popup + extração + zip CSV/JSON (RF01–RF09) |
| 3 | Progresso, cancelamento, resumo, fallback DOM (RF10–RF11) |
| 4 | Testes de aceite com você e README de instalação |
| 5 | Pacote e textos para a Chrome Web Store (RF16) |
| 6 | Opcionais aprovados (RF12, RF14) |

## 14. Questões abertas

| ID | Pergunta | Decisão (19/11/2026) |
|---|---|---|
| Q1 | Incluir o **texto** das mensagens ou somente metadados? | **Incluir texto** (corpo e legendas) |
| Q2 | Incluir **grupos** ou apenas conversas individuais? | **Individuais e grupos** |
| Q3 | Formato de saída? | **CSV + JSON por conversa, em .zip** (RF14/XLSX fica fora da v1) |
| Q4 | Histórico já carregado ou "aprofundar"? | **Já carregado por padrão + modo "aprofundar" opcional** (RF13 sobe para Should) |

## 15. Aprovação

| Nome | Papel | Data | Decisão |
|---|---|---|---|
| Patrocinador do projeto | Patrocinador | 19/11/2026 | ☑ Aprovado — com o acréscimo de RF15/RF16 (instalação fora da loja e posterior publicação) |

## 16. Revisão técnica após o 1º teste real (19/11/2026)

O primeiro teste em uma conta logada (WhatsApp Business) mostrou que a **opção A (base local) sozinha não entrega o texto**. O WhatsApp guarda o conteúdo das mensagens cifrado (`msgRowOpaqueData`) e grava localmente só os metadados das conversas abertas. Detalhes em `docs/spike.md`.

Nova abordagem (v1.1.0), mantendo o "1 clique":
1. Base local → contatos, grupos, números ocultos e metadados.
2. Tela → a extensão abre cada conversa, uma por vez, e lê o texto (opção B deixa de ser fallback e passa a ser obrigatória para o texto).
3. Cruzamento pelo ID da mensagem.

Impactos: a extração fica mais lenta (proporcional ao número de conversas) e a aba precisa ficar em uso pela extensão até terminar. Abrir conversas pode marcá-las como lidas (R8), o que levou à criação do RF18. A meta de desempenho da seção 2 passa a ser aferida no teste de aceite.
