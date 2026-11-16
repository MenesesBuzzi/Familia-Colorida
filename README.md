# 🎈 Família Colorida

App de jogos em família, cada um no seu celular:

- **🎁 Amigo Secreto** — grupo com código, lista de desejos, sorteio seguro (ninguém tira a si mesmo e cada um só vê o próprio resultado), tela "toque para revelar", **Sala da Comunidade** (chat em tempo real) e **mensagens anônimas** (você fala com quem tirou e responde a quem te tirou, sem revelar ninguém).
- **🐺 Lobisomem (Cidade Dorme)** — sala com código, papéis secretos (Lobisomem, Vidente, Médico, Caçador, Bruxa, Aldeão), noite/dia/votação, **fantasmas que sussurram** e o narrador IA **"Sussurro"** (Google Gemini), com a regra opcional dos **objetos falantes**.

Feito com **Expo SDK 58** (React Native 0.88, React 19.3) em JavaScript + **Supabase** (banco, Realtime, Edge Function). Roda no **Expo Go**, sem módulos nativos extras.

---

## 1. Supabase (banco de dados)

1. Entre em <https://supabase.com/dashboard>.
   - Se o seu projeto estiver **pausado**, abra-o e clique em **Restore project** (leva alguns minutos).
   - Ou crie um novo: **New project** (região: *South America (São Paulo)*).
2. Vá em **SQL Editor → New query**, cole TODO o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. (Pode rodar de novo sem problema.)
3. Ative o login anônimo (o app não pede cadastro):
   **Authentication → Sign In / Providers → "Allow anonymous sign-ins" → ligar → Save**.
4. Copie a URL e a chave pública: **Project Settings → API** (ou **API Keys**):
   - `Project URL` → `https://xxxx.supabase.co`
   - `anon public` (começa com `eyJ...`) **ou** `publishable key` (`sb_publishable_...`)

> Realtime: o `schema.sql` já adiciona as tabelas na publicação `supabase_realtime`. Se algum dia o chat não atualizar sozinho, confira em **Database → Publications → supabase_realtime**.

## 2. Narrador IA "Sussurro" (Edge Function + Gemini, grátis)

1. Pegue uma chave grátis do Gemini em <https://aistudio.google.com/apikey> (**Create API key**).
2. Instale/rode o Supabase CLI e faça login (no computador):
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF   # o "xxxx" da URL
   ```
3. Guarde a chave **no servidor** (ela nunca vai para o app):
   ```bash
   npx supabase secrets set GEMINI_API_KEY=cole_sua_chave_aqui
   # opcional: escolher o modelo (padrão tenta gemini-flash-latest, gemini-2.5-flash, gemini-2.0-flash)
   npx supabase secrets set GEMINI_MODEL=gemini-2.5-flash
   ```
4. Publique a função (rode dentro da pasta do projeto):
   ```bash
   npx supabase functions deploy narrador
   ```

Se a IA falhar (sem chave, sem internet, limite grátis estourado), o app usa **narrações prontas** automaticamente — o jogo nunca trava por causa disso. Também dá para desligar a IA no lobby.

## 3. Rodar no celular (Expo Go)

```bash
cp .env.example .env        # no Windows: copy .env.example .env
# edite o .env com a URL e a chave do passo 1
npm install
npx expo start
```

- Instale o **Expo Go** na Play Store (atualizado — precisa suportar o **SDK 58**).
- Escaneie o QR code que aparece no terminal com o Expo Go.
- Celular e computador na mesma rede Wi-Fi. Se não conectar, use `npx expo start --tunnel`.
- Os jogadores podem estar em **qualquer lugar com internet**: tudo passa pelo Supabase. O Wi-Fi só importa para carregar o app pelo Expo Go durante o desenvolvimento.

Testes rápidos das regras do Lobisomem: `npm test` · Lint: `npm run lint`.

## 4. Gerar o APK (instalar sem o Expo Go)

```bash
npm install -g eas-cli      # ou use: npx eas-cli@latest ...
eas login                   # conta grátis em expo.dev
eas build:configure         # só na primeira vez (vincula o projeto)
eas build -p android --profile preview
```

O perfil `preview` (em `eas.json`) gera um **.apk**. No fim aparece um link/QR para baixar e instalar no Android (permita "instalar apps desconhecidos").

> O `.env` precisa existir na pasta quando você rodar o `eas build` (ele é enviado junto e as variáveis `EXPO_PUBLIC_*` entram no APK). Alternativa: cadastre as duas variáveis em **expo.dev → seu projeto → Environment variables**.

Pacote Android: `com.nunes.familiacolorida` (mude em `app.json` se quiser).

---

## Como jogar

### 🎁 Amigo Secreto
1. Na tela inicial, escolha seu **apelido** e toque em *Amigo Secreto*.
2. O organizador cria o grupo (nome, valor máximo, data) e compartilha o **código de 6 letras**.
3. Todos entram com o código e escrevem a **lista de desejos**.
4. O organizador toca em **Fazer o sorteio** (mínimo 3 pessoas). O sorteio roda no banco (função `draw_ss_group`) e cada pessoa só consegue ler o próprio par.
5. **Ver meu amigo secreto** → toque no presente para revelar.
6. **Sala da Comunidade** = chat de todo mundo. **Mensagens anônimas** = fale com quem você tirou / responda a quem te tirou.

### 🐺 Lobisomem
1. Quem cria a sala é o **anfitrião**: o celular dele comanda a partida — mantenha o app aberto e a tela ligada.
2. Mínimo de **5 jogadores**. O app sugere os papéis pelo número de pessoas; o anfitrião pode ajustar.
3. **Noite**: todo mundo mexe no celular (até os aldeões tocam em "Dormir", para disfarçar).
   Lobos escolhem a vítima juntos (veem os votos uns dos outros), a Vidente descobre um papel, o Médico protege alguém e depois a Bruxa decide se usa a cura e/ou o veneno.
4. **Dia**: o Sussurro narra quem morreu, os fantasmas mandam pistas e um objeto da vila "fala". Discussão com cronômetro.
5. **Votação** secreta: o mais votado sai (empate = ninguém). Se o Caçador morrer, ele leva alguém junto.
6. Vitória: **sem lobos → vila vence**; **lobos ≥ resto → lobos vencem**.
7. **Fantasmas** (mortos) mandam 1 sussurro por rodada (até 80 letras). A IA transforma em pista enigmática, sem nomes.
8. O anfitrião tem **"Forçar próxima fase"** se alguém sumir.

---

## Estrutura

```
App.js                       navegação em pilha + login anônimo
src/theme.js                 paleta colorida (claro) + tema noite/dia do Lobisomem
src/components/ui.js         Screen, Btn, Card, Field, Avatar, Countdown...
src/components/CodeBox.js    código da sala (copiar/compartilhar)
src/components/werewolf/     Lobby, Game (painéis por papel/fase), EndGame, parts
src/screens/HomeScreen.js
src/screens/secretSanta/     SSMenu, SSGroup, SSReveal, SSChat, SSAnon
src/screens/werewolf/        WWMenu, WWRoom
src/lib/supabase.js          cliente Supabase (AsyncStorage + url-polyfill)
src/lib/realtime.js          hooks de Realtime e polling
src/lib/werewolf/logic.js    regras puras (testadas em scripts/test-logic.mjs)
src/lib/werewolf/host.js     máquina de estados do anfitrião
src/lib/werewolf/narrator.js chama a Edge Function + fallback
supabase/schema.sql          tabelas, RLS, RPCs, realtime
supabase/functions/narrador  Edge Function (Deno) → Gemini
eas.json                     perfil "preview" = APK
```

## Limitações conhecidas

- O **anfitrião** comanda o Lobisomem pelo próprio celular: se ele fechar o app, a partida pausa até ele voltar (ao reabrir a sala, continua de onde parou).
- Por isso o banco deixa o celular do anfitrião ler todos os papéis. A tela não mostra nada, mas alguém com conhecimento técnico poderia espiar — em família, tudo certo 😄. Os outros jogadores **não** conseguem ver papéis alheios (protegido por RLS).
- A data da troca é digitada (DD/MM/AAAA).
- Sessão anônima: se desinstalar o app ou limpar os dados, você vira um "novo usuário" e precisa entrar de novo nos grupos com o código.
