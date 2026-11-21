# 🎈 Família Colorida (v3)

App de jogos em família, cada um no seu celular, com uma tela inicial estilo celular cheia de "apps":

- **🎁 Amigo Secreto**: grupo com código, lista de desejos, sorteio seguro (ninguém tira a si mesmo e cada um só vê o próprio resultado), "toque para revelar", **Sala da Comunidade** (chat em tempo real) e **mensagens anônimas** com quem você tirou.
- **🐺 Lobisomem (Cidade Dorme)**: sala com código, dá pra jogar **de longe** (pela internet). Papéis secretos em **cartas que viram** (Lobisomem, Vidente, Médico, Caçador, Bruxa, Aldeão), ações em cartas, lista de quem está online, abas **Jogo / Chat / Fantasmas**, e o **Sussurro** (Google Gemini) como **apresentador**: dá boas-vindas, conta vivos e mortos, brinca com o pessoal e narra a noite, os fantasmas e os objetos falantes. Nunca revela papéis.
- **📻 Rádio Amigo**: sala com código, **📚 Biblioteca de MP3** compartilhada, fila com votos 👍/👎, a rádio **toca de verdade** em todos os celulares (inclusive em segundo plano, no APK), **walkie-talkie** com "passar o microfone", aba de ideias com **🤖 IA sugere** e a **Playlist** para abrir no YouTube/Spotify.
- **💬 Chat**: sala **Família** (todo mundo), salas com código, **conversa privada** e **mensagens de voz**, com contador de não lidas no ícone.
- Login com **Google**, com **e-mail e senha** ou como **convidado**.

Feito com **Expo SDK 58** (React Native 0.88, React 19.3) em JavaScript + **Supabase** (banco, Realtime, Auth, Edge Function). Roda no **Expo Go**.

---

## ✨ Novidades da v3

- **📚 Biblioteca de músicas (tipo Google Drive)**: qualquer pessoa logada envia MP3 do celular (Rádio > 📚 Biblioteca > ⬆️ Enviar MP3). Tudo fica guardado para sempre no bucket `radio` do Supabase e qualquer rádio pode usar.
- **🎧 Rádio ao vivo**: cada rádio tem uma fila de músicas da Biblioteca; todo mundo vota e a mais votada toca primeiro (fila vazia = música surpresa da Biblioteca). Quem criou a rádio dá **▶️ play, ⏸️ pausa, ⏭️ pula**. A música fica sincronizada em todos os celulares e **continua tocando nas outras telas** — uma barrinha da rádio aparece embaixo em todas as telas (título, play/pause para o dono, abrir a rádio, ✕ parar de ouvir).
- **📢 Walkie-talkie**: o dono da rádio **segura "Falar"**, grava até 30 s e todo mundo que está ouvindo escuta sozinho em 1–3 s (a música abaixa enquanto a voz toca). O dono pode **passar o microfone** para outras pessoas (e tirar).
- **🐺 Trilha sonora do Lobisomem**: cada fase tem seu som (noite, dia, votação, morte, vitória...). O anfitrião escolhe no lobby: **Padrão**, **Eu escolho** (escolhe o som de cada cena, dos embutidos ou enviados por vocês), **IA escolhe** (o Sussurro escolhe o clima junto com a narração) ou **Sem trilha**. Tem **🎛️ mesa de efeitos** (uivo, trovão, sino, tambor...) que o anfitrião toca para todos, e cada um pode deixar o som 🔇 mudo no próprio celular. A Rádio **pausa sozinha** durante a partida e volta no fim.
  - Os 13 sons embutidos (`assets/sounds/`) são **originais**, gerados por programa (`npm run sounds`, precisa de Python 3 + ffmpeg). Nada com direitos autorais.
- **💬 App Chat**: sala **Família** (todo mundo logado), **salas por código**, **conversa privada** e **mensagens de voz** (segure o 🎤). O ícone do Chat mostra quantas mensagens você não leu.

> Só **MP3 enviado** toca na rádio. Música do **YouTube/Spotify não toca** dentro do app (as regras deles não deixam); elas continuam na aba "Ideias/Playlist" como links.

## ⬆️ Atualizar da v2 para a v3 (sem perder nada)

1. Extraia o zip da v3 numa pasta nova e **copie o seu `.env`** da v2 para ela (o `app.json`, o `eas.json`, o slug e o pacote `com.nunes.familiacolorida` continuam iguais).
2. Instale as dependências (as novas são `expo-audio`, `expo-document-picker` e `expo-file-system`, já no `package.json`):
   ```powershell
   npm install
   ```
   (Se preferir instalar só as novas num projeto já instalado: `npx expo install expo-audio expo-document-picker expo-file-system`.)
3. **Supabase > SQL Editor > New query**: cole TODO o `supabase/v3-upgrade.sql` e clique em **Run**.
   - Ele só **adiciona** tabelas, colunas, regras e funções; não apaga nada da v1/v2 e pode rodar de novo quantas vezes quiser.
   - Os **buckets** `radio`, `voz` e `lobo-sons` do Storage são **criados automaticamente** pelo script.
   - (Alternativa: rodar o `supabase/schema.sql` completo, que já inclui a v3 no final.)
4. **Publique de novo a Edge Function** `narrador`: Edge Functions > narrador > Code, cole o `supabase/functions/narrador/index.ts` novo e clique em **Deploy** (ou `npx supabase functions deploy narrador`). Ela continua respondendo igual à v2; a novidade é escolher o som no modo "IA escolhe". Se não publicar, tudo funciona e a trilha usa o som padrão.
5. Rode: `npx expo start` (Expo Go) ou gere o APK (abaixo).

## 📱 Expo Go x APK

- **No Expo Go** dá para testar tudo: Biblioteca, fila, votos, walkie-talkie, mensagens de voz, trilha do Lobisomem e mesa de efeitos. O microfone pede permissão na primeira vez.
- **Música em segundo plano / com a tela bloqueada** pode **parar no Expo Go** (limitação do Expo Go). No **APK** funciona, com os controles na tela de bloqueio:
  ```powershell
  eas build -p android --profile preview
  ```
  O APK da v3 tem `version 3.0.0` / `versionCode 3`, então instala por cima do APK da v2 (mesmo pacote).

## 📏 Limites (plano grátis do Supabase)

- Storage grátis: **1 GB** → umas **200 músicas** de 5 MB. Cada MP3 pode ter até **20 MB**; sons do Lobisomem até **5 MB**; falas de voz até **3 MB** (≈ 30–60 s).
- Tráfego grátis: ~**5 GB/mês** de download. Cada pessoa ouvindo baixa a música inteira (5 MB × 10 ouvintes = 50 MB por música). Rádio tocando o dia todo para muita gente gasta isso rápido.
- A fila só **avança sozinha** se o celular de quem criou a rádio estiver com o app aberto (ou ouvindo em segundo plano no APK). Os outros escutam o que o dono tocar.
- A sincronia entre celulares é boa, mas não perfeita (diferença de 1–3 s é normal). O walkie-talkie chega com 1–3 s de atraso.
- Para a fala do walkie-talkie tocar sozinha, a pessoa precisa estar **ouvindo a rádio** (chave "🔊 Ouvindo neste celular").
- Arquivos de voz ficam num bucket **privado** (o app usa links temporários); MP3 da Biblioteca e sons do Lobisomem ficam em buckets **públicos** (quem tiver o link consegue baixar).

---

## 0. O que você precisa

- **Node.js LTS** (https://nodejs.org). Confira no PowerShell: `node -v` e `npm -v`.
- **Expo Go atualizado** no celular (Play Store). Precisa suportar o **SDK 58**.
- Uma conta no **Supabase** e uma chave grátis do **Gemini** (https://aistudio.google.com).

## 1. Extrair e instalar (PowerShell)

Extraia o zip **fora do OneDrive**, por exemplo em `C:\dev\familia-colorida` (clique direito no zip > Extrair tudo).

```powershell
cd C:\dev\familia-colorida
Get-Content package.json -TotalCount 3   # deve começar com {  e "name": "familia-colorida"
npm install
Copy-Item .env.example .env
notepad .env
```

No `.env`, preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).

## 2. Supabase: banco de dados

1. Em https://supabase.com/dashboard abra seu projeto. Se estiver **pausado**, clique em **Restore project**. Ou crie um novo (região São Paulo).
2. **SQL Editor > New query**: cole TODO o `supabase/schema.sql` e clique em **Run**. Pode rodar de novo por cima da v1/v2 sem perder nada (quem já tem a v2 pode rodar só o `supabase/v3-upgrade.sql`). Os buckets do Storage (`radio`, `voz`, `lobo-sons`) são criados pelo próprio script.

## 3. Supabase: login

**Authentication > Sign In / Providers**:

1. **Email**: ligado. (Se quiser entrar sem confirmar e-mail, desligue "Confirm email".)
2. **Allow anonymous sign-ins**: ligado (para "Entrar como convidado").
3. **Google**: ligado. Para pegar o Client ID e o Secret:
   - Acesse https://console.cloud.google.com > crie um projeto > **APIs e serviços > Tela de consentimento OAuth** (tipo Externo, preencha nome e e-mail).
   - **Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web**.
   - Em **URIs de redirecionamento autorizados** coloque a "Callback URL" que o Supabase mostra na tela do Google (algo como `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
   - Copie o **Client ID** e o **Client Secret** para o Supabase e salve.

**Authentication > URL Configuration > Redirect URLs**, adicione:

```
exp://**
familiacolorida://**
```

## 4. A IA (Edge Function "narrador"), sem precisar de CLI

1. Pegue sua chave em https://aistudio.google.com > **Get API key**.
2. No Supabase: **Edge Functions > Deploy a new function > Via Editor**.
3. Nome: `narrador`. Apague o exemplo, cole TODO o `supabase/functions/narrador/index.ts` e clique em **Deploy**.
4. **Edge Functions > Secrets**: adicione `GEMINI_API_KEY` com a sua chave. (Opcional: `GEMINI_MODEL` para escolher outro modelo.)

Sem a chave o app funciona igual, só que com falas prontas no lugar da IA.

(Com CLI, opcional: `npx supabase login`, `npx supabase link --project-ref SEU_REF`, `npx supabase functions deploy narrador`, `npx supabase secrets set GEMINI_API_KEY=...`.)

## 5. Rodar no celular (Expo Go)

```powershell
npx expo start
```

Escaneie o QR code com o Expo Go. Se o celular **não** estiver na mesma Wi-Fi do PC:

```powershell
npx expo start --tunnel
```

Os jogadores não precisam estar no mesmo lugar: as salas funcionam pela internet com o código.

## 6. Gerar o APK

```powershell
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

O `.env` precisa estar na pasta na hora do build (ou cadastre as duas variáveis `EXPO_PUBLIC_...` no expo.dev, em Environment variables). No fim o EAS dá um link para baixar o APK.

## 7. Testes do projeto

```powershell
npm test      # regras do Lobisomem, apresentador, fila/sincronia/microfone da rádio, trilha sonora, chat
npm run lint
npm run sounds  # (opcional) gera de novo os sons do Lobisomem — precisa de Python 3 e ffmpeg
```

## Problemas comuns

- **`npm error EJSONPARSE` / package.json com `\u0000`**: o arquivo corrompeu na extração. Rode
  `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"`, depois `npm cache verify`, apague a pasta e extraia o zip de novo fora do OneDrive.
- **Login com Google volta com erro ou não volta para o app**: confira as Redirect URLs (`exp://**` e `familiacolorida://**`) e a Callback URL no Google Cloud. No Expo Go o endereço muda conforme a rede, por isso o `**`.
- **"Project is incompatible with this version of Expo Go"**: atualize o Expo Go na Play Store (o projeto usa SDK 58).
- **IA não fala nada**: veja se a função `narrador` foi publicada e se o secret `GEMINI_API_KEY` existe. Em Edge Functions > narrador > Logs aparece o erro.
- **Música não toca / "Bucket not found"**: rode o `supabase/v3-upgrade.sql` (ele cria os buckets). Em Storage devem aparecer `radio`, `voz` e `lobo-sons`.
- **Rádio para quando bloqueio a tela**: no Expo Go isso pode acontecer; no APK (`eas build -p android --profile preview`) a música continua.
- **Walkie-talkie não toca nos outros celulares**: eles precisam estar com "🔊 Ouvindo neste celular" ligado na rádio. Quem fala precisa ter o microfone (o dono passa em "Passar o microfone").
- **Microfone negado**: Configurações do Android > Apps > Expo Go (ou Família Colorida) > Permissões > Microfone.
- **Lobisomem parado**: quem criou a sala é o "anfitrião" e o celular dele comanda o jogo. Ele precisa ficar com o app aberto; se sair, entra de novo com o código e o jogo continua.

## Estrutura

```
App.js                      login, navegação, perfil
src/apps/registry.js        lista de mini-apps da tela inicial (adicione um novo app aqui)
src/screens/                Home, Login, Perfil, secretSanta/, werewolf/, radio/ (+ Biblioteca), chat/
src/components/             ui, cards/ (cartas), chat/, werewolf/ (+ SoundPanel), radio/ (LivePanel), audio/ (MiniPlayer, HoldToTalk, VoiceMessage)
src/lib/                    supabase, auth, profile, werewolf/ (+ soundtrack), radio/ (+ queue, library), chat/, audio/ (player global)
assets/sounds/              13 sons originais do Lobisomem (scripts/gen-sounds.py)
supabase/schema.sql         banco completo (v1 + v2 + v3) + regras de acesso + storage + realtime
supabase/v3-upgrade.sql     só as novidades da v3 (para quem já rodou a v2)
supabase/functions/narrador IA (Gemini)
```
