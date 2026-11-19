# Textos e respostas para a Chrome Web Store

Copie cada bloco para o campo correspondente no Painel de Desenvolvedor (https://chrome.google.com/webstore/devconsole).

## Item → Detalhes da loja

**Nome** (vem do manifesto): Extrator de Conversas para WhatsApp Web

**Resumo** (até 132 caracteres, vem do manifesto):
Exporta todas as conversas do WhatsApp Web com 1 clique: número, nome, data, hora e texto de cada mensagem, em CSV e JSON.

**Descrição:**
```
Exporte todas as suas conversas do WhatsApp Web com um único clique.

O que você recebe
• Um arquivo .zip com uma planilha CSV e um JSON para cada conversa (individuais e grupos)
• Para cada mensagem: data, hora, quem enviou (número e nome), para quem, se foi enviada ou recebida, tipo (texto, imagem, áudio…) e o texto
• Em grupos, cada mensagem identifica o participante que a enviou
• Um índice geral com todas as conversas, quantidade de mensagens e período
• CSV pronto para abrir no Excel em português (acentos e colunas corretos)

Privacidade em primeiro lugar
• Tudo é processado no seu computador. Nenhum dado é enviado para servidores.
• Sem cadastro, sem analytics, sem anúncios.
• Somente leitura: a extensão não envia, apaga nem altera mensagens.

Como usar
1. Abra o WhatsApp Web no Chrome e faça login.
2. Clique no ícone da extensão.
3. Clique em "Extrair todas as conversas".

Funciona no WhatsApp Web pessoal e no WhatsApp Business.

Para ler o texto, a extensão abre cada conversa na tela, uma por vez. Conversas com mensagens não lidas são preservadas por padrão (não são abertas, para não serem marcadas como lidas). A opção "Aprofundar histórico" rola cada conversa até o início para trazer mensagens antigas.

Importante: a extensão exporta o que o WhatsApp Web tem disponível no seu navegador. O arquivo gerado contém dados pessoais: guarde e compartilhe com responsabilidade (LGPD).

Esta extensão é independente e não é afiliada ao WhatsApp nem à Meta.
```

**Categoria:** Produtividade (Productivity → Tools)
**Idioma:** Português (Brasil)

**Recursos gráficos:**
- Ícone 128×128: `store/store-icon-128.png`
- Bloco promocional pequeno 440×280: `store/promo-440x280.png`
- Capturas de tela 1280×800 (mínimo 1, até 5): **fazer manualmente** — popup aberto sobre o WhatsApp Web, painel de progresso e o CSV aberto no Excel. Use uma conta de teste ou borre nomes e números reais.

## Item → Práticas de privacidade

**Descrição do propósito único:**
```
Exportar as conversas do WhatsApp Web do próprio usuário para arquivos CSV e JSON no computador dele.
```

**Justificativa da permissão de host (`https://web.whatsapp.com/*`):**
```
A extensão só funciona no WhatsApp Web. O acesso ao site é necessário para ler, na aba do próprio usuário e somente quando ele clica em "Extrair", as conversas que o WhatsApp Web já mantém no navegador e gerar o arquivo de exportação localmente. Nenhum outro site é acessado.
```

**Uso de código remoto:** Não, não uso código remoto.

**Uso de dados — marcar:**
- [x] Informações de identificação pessoal (nome, número de telefone)
- [x] Comunicações pessoais (mensagens)

**Certificações — marcar as três:**
- [x] Não vendo nem transfiro dados do usuário a terceiros, fora dos casos de uso aprovados
- [x] Não uso nem transfiro dados do usuário para fins não relacionados ao propósito único do item
- [x] Não uso nem transfiro dados do usuário para determinar capacidade de crédito ou para empréstimos

**URL da política de privacidade:** https://mainsantiago.github.io/ExtratorWhatsapp/privacidade/

## Pontos de atenção na revisão
- **Marca registrada:** o nome usa "para WhatsApp Web" de forma descritiva, sem logo do WhatsApp, e a descrição deixa claro que não há afiliação. Se o Google recusar por marca, troque o nome no `manifest.json` para algo como "Extrator de Conversas — Exportador de Chats" e mantenha a menção ao WhatsApp só na descrição.
- **Propósito único e permissões mínimas:** a extensão pede apenas acesso ao WhatsApp Web; não pede `tabs`, `downloads`, `storage` nem `<all_urls>`.
- **Prazo:** extensões que leem dados de sites costumam ter revisão mais demorada (de alguns dias a algumas semanas).
