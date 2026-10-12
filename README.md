# Gênio $ (genio-cash)

Controle financeiro pessoal: você lança na mão tudo que entra e tudo que sai.

- **Site:** GitHub Pages (grátis)
- **Banco de dados e login:** Supabase (grátis)
- **Instalável no celular** como app (PWA)

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | Estrutura das telas (login, app, formulários) |
| `style.css` | Cores, fontes e layout. As cores ficam no topo, em `:root` |
| `app.js` | Toda a lógica: login, salvar, calcular saldo, desenhar a tela |
| `config.js` | Endereço e chave do **seu** Supabase |
| `supabase.sql` | Cria a tabela e as regras de segurança no banco |
| `manifest.webmanifest` | Nome, ícone e cor quando instala no celular |
| `sw.js` | Faz o app abrir rápido e funcionar como app instalado |
| `icon-*.png` | Ícones |

## Passo a passo (faça no computador)

### 1. Criar o banco no Supabase
1. Entre em supabase.com e crie uma conta (pode usar o GitHub)
2. **New project** → nome `genio-cash`, crie uma senha do banco, região **South America (São Paulo)**
3. Espere uns 2 minutos o projeto ficar pronto
4. Menu lateral **SQL Editor** → **New query** → cole todo o conteúdo do `supabase.sql` → **Run**
5. Deve aparecer "Success. No rows returned"

### 2. Pegar as chaves
1. **Project Settings → API** (ou o botão **Connect** no topo)
2. Copie **Project URL** e a chave **anon / public**
3. Cole no `config.js` no lugar dos textos de exemplo

### 3. Subir no GitHub
1. Crie um repositório novo chamado `genio-cash` (público)
2. **Add file → Upload files** → arraste todos os arquivos desta pasta → **Commit**
3. **Settings → Pages** → Source: **Deploy from a branch** → branch `main`, pasta `/ (root)` → **Save**
4. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/genio-cash/`

### 4. Avisar o Supabase do endereço do site
1. Supabase → **Authentication → URL Configuration**
2. **Site URL:** `https://SEU-USUARIO.github.io/genio-cash/`
3. Isso faz o link de confirmação do e-mail voltar pro seu app

### 5. Criar sua conta e instalar no celular
1. Abra o endereço no celular → **Criar conta** → confirme pelo e-mail → **Entrar**
2. **iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**
3. **Android (Chrome):** menu ⋮ → **Instalar app**

### 6. Trazer os lançamentos do Meu Caixa (Claude)
1. No Meu Caixa, toque em **Copiar dados**
2. No Gênio $, toque em **Dados** → cole no campo → **Importar**

## Segurança
A chave `anon` pode ficar pública no GitHub, ela foi feita pra isso.
Quem protege seus dados são as regras (RLS) do `supabase.sql`:
cada conta só enxerga os próprios lançamentos.
**Nunca** coloque a chave `service_role` no site.

## Atualizar depois
Edite o arquivo no GitHub (ícone de lápis) → **Commit**. O site atualiza sozinho em 1–2 minutos.
Se mudar `style.css` ou `app.js` e o celular insistir na versão velha, troque `genio-cash-v1` por `v2` no `sw.js`.

## Ideias pra próxima versão
- Contas recorrentes (aluguel, internet)
- Orçamento por categoria com alerta
- Gráfico dos últimos 6 meses
- Reescrever o backend em Python (FastAPI)
