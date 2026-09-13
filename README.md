# Trilha Gramatical — Guia de Publicação (GitHub + Streamlit + Supabase)

Este pacote contém o app "Trilha Gramatical" pronto para publicar. Siga os passos
**na ordem**: primeiro o Supabase (login/senha e nuvem), depois o GitHub, depois o Streamlit.

---

## Passo 1 — Criar o projeto no Supabase (login e banco de dados)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita (se ainda não tiver).
2. Clique em **New Project**. Escolha um nome (ex.: `trilha-gramatical`) e uma senha de banco de dados (guarde-a, mas não é a mesma senha do app).
3. Aguarde ~2 minutos até o projeto ficar pronto.
4. No menu lateral, vá em **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` (incluído neste pacote), copie **todo o conteúdo** e cole no editor. Clique em **Run**.
   - Isso cria a tabela `progress` (pontuação, energia, unidades concluídas) e as regras de segurança para que cada pessoa só veja o próprio progresso.
6. Vá em **Authentication → Providers** e confirme que **Email** está habilitado (vem habilitado por padrão).
   - Opcional: em **Authentication → Settings**, você pode desativar a exigência de confirmação por e-mail se quiser testar mais rápido ("Confirm email" → desligar). Para uso pessoal isso é seguro.
7. Vá em **Project Settings → API**. Copie dois valores:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (uma chave longa)

## Passo 2 — Conectar o app ao Supabase

1. Abra o arquivo `static/auth.js` neste pacote.
2. Substitua estas duas linhas no topo do arquivo pelos valores copiados no Passo 1:
   ```js
   const SUPABASE_URL = "COLE_AQUI_A_SUA_SUPABASE_URL";
   const SUPABASE_ANON_KEY = "COLE_AQUI_A_SUA_SUPABASE_ANON_KEY";
   ```
3. Salve o arquivo.

> A "anon key" é pública por design (ela roda no navegador de qualquer usuário) — a proteção real vem das políticas de segurança (RLS) já criadas pelo `schema.sql`, que garantem que cada usuário só acessa seus próprios dados.

## Passo 3 — Subir para o GitHub

1. Crie um repositório novo no GitHub (pode ser privado).
2. Envie **toda esta pasta** (`app.py`, `requirements.txt`, `static/`, `supabase/`) para o repositório, mantendo a mesma estrutura de pastas.
3. Confirme que a estrutura ficou assim:
   ```
   seu-repositorio/
   ├── app.py
   ├── requirements.txt
   ├── static/
   │   ├── index.html
   │   ├── styles.css
   │   ├── app.js
   │   ├── auth.js
   │   └── content.js
   └── supabase/
       └── schema.sql
   ```

## Passo 4 — Publicar no Streamlit Community Cloud

1. Acesse [share.streamlit.io](https://share.streamlit.io) e entre com sua conta GitHub.
2. Clique em **New app**.
3. Selecione o repositório e a branch que você acabou de criar.
4. Em "Main file path", digite `app.py`.
5. Clique em **Deploy**.
6. Em 1–2 minutos o Streamlit gera um link público, algo como:
   `https://SEU-APP.streamlit.app`

## Passo 5 — Criar sua conta de login e testar

1. Abra o link gerado pelo Streamlit.
2. Na tela de entrada, clique em **"Ainda não tem conta? Criar conta"**, informe seu e-mail e uma senha (mínimo 6 caracteres).
3. Se a confirmação por e-mail estiver ativa no Supabase, verifique sua caixa de entrada antes de conseguir entrar.
4. Depois de logado, teste a troca de senha em **👤 (ícone de conta) → Trocar senha**.
5. Seu progresso (pontuação, energia, unidades concluídas) agora fica salvo na nuvem e aparece em qualquer dispositivo onde você fizer login com a mesma conta.

---

## Perguntas frequentes

**Preciso pagar por algum desses serviços?**
Não — Supabase, GitHub e Streamlit Community Cloud têm planos gratuitos suficientes para uso pessoal.

**Posso trocar minha senha depois?**
Sim, a qualquer momento pelo ícone 👤 no topo do app, informando a senha atual e a nova senha duas vezes.

**E se eu esquecer minha senha?**
Este pacote não inclui fluxo de "esqueci minha senha" por e-mail (pode ser adicionado depois via `supabaseClient.auth.resetPasswordForEmail`). Por ora, você pode redefinir manualmente pelo painel do Supabase em **Authentication → Users → (seu usuário) → Reset password**.

**O app funciona sem internet?**
As telas carregam offline (é só HTML/CSS/JS), mas login e sincronização na nuvem exigem conexão. Sem Supabase configurado, o app cai automaticamente em modo local (localStorage), sem login.
