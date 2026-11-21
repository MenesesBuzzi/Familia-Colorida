// =====================================================================
// Registro dos "apps" da tela inicial (o launcher).
// Para criar um mini-app novo: faça as telas em src/screens/<app>/ e adicione UMA entrada aqui.
//
//   {
//     id: 'quiz',                 // único
//     title: 'Quiz',              // nome embaixo do ícone
//     emoji: '❓',                // ícone
//     colors: ['#FF6B6B', '#FF9F1C'], // fundo do ícone (2 cores = efeito degradê)
//     description: 'Perguntas e respostas em família',
//     entry: 'QuizMenu',          // tela que abre ao tocar no ícone
//     screens: { QuizMenu: QuizMenuScreen, QuizRoom: QuizRoomScreen },
//   }
//
// Para mostrar um ícone "Em breve", use: { id, title, emoji, colors, soon: true }
// Selinho de "não lidas" no ícone (v3): badge: 'chat' (a tela inicial conta e mostra o número)
// =====================================================================
import SSMenuScreen from '../screens/secretSanta/SSMenuScreen';
import SSGroupScreen from '../screens/secretSanta/SSGroupScreen';
import SSRevealScreen from '../screens/secretSanta/SSRevealScreen';
import SSChatScreen from '../screens/secretSanta/SSChatScreen';
import SSAnonScreen from '../screens/secretSanta/SSAnonScreen';
import WWMenuScreen from '../screens/werewolf/WWMenuScreen';
import WWRoomScreen from '../screens/werewolf/WWRoomScreen';
import RadioMenuScreen from '../screens/radio/RadioMenuScreen';
import RadioRoomScreen from '../screens/radio/RadioRoomScreen';
import RadioLibraryScreen from '../screens/radio/RadioLibraryScreen';
import ChatMenuScreen from '../screens/chat/ChatMenuScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import ChatNewDMScreen from '../screens/chat/ChatNewDMScreen';
import ProfileScreen from '../screens/ProfileScreen';

export const APPS = [
  {
    id: 'amigo-secreto',
    title: 'Amigo Secreto',
    emoji: '🎁',
    colors: ['#FF6B6B', '#F15BB5'],
    description: 'Sorteio, lista de desejos e mensagens anônimas',
    entry: 'SSMenu',
    screens: {
      SSMenu: SSMenuScreen,
      SSGroup: SSGroupScreen,
      SSReveal: SSRevealScreen,
      SSChat: SSChatScreen,
      SSAnon: SSAnonScreen,
    },
  },
  {
    id: 'lobisomem',
    title: 'Lobisomem',
    emoji: '🐺',
    colors: ['#3A3F75', '#9B5DE5'],
    description: 'Cidade Dorme online com o Sussurro (IA) apresentando',
    entry: 'WWMenu',
    screens: { WWMenu: WWMenuScreen, WWRoom: WWRoomScreen },
  },
  {
    id: 'radio',
    title: 'Rádio Amigo',
    emoji: '📻',
    colors: ['#2EC4B6', '#4D96FF'],
    description: 'Biblioteca de MP3, fila com votos, rádio tocando em segundo plano e walkie-talkie',
    entry: 'RadioMenu',
    screens: { RadioMenu: RadioMenuScreen, RadioRoom: RadioRoomScreen, RadioLibrary: RadioLibraryScreen },
  },
  {
    id: 'chat',
    title: 'Chat',
    emoji: '💬',
    colors: ['#4D96FF', '#9B5DE5'],
    description: 'Sala da Família, salas por código, conversa privada e mensagens de voz',
    entry: 'ChatMenu',
    badge: 'chat',
    screens: { ChatMenu: ChatMenuScreen, ChatRoom: ChatRoomScreen, ChatNewDM: ChatNewDMScreen },
  },
  {
    id: 'perfil',
    title: 'Meu Perfil',
    emoji: '🙂',
    colors: ['#FFC93C', '#FF9F1C'],
    description: 'Apelido, foto e sair da conta',
    entry: 'Profile',
    screens: { Profile: ProfileScreen },
  },
  // ---- Em breve (exemplos do padrão de placeholder) ----
  { id: 'quiz', title: 'Quiz', emoji: '❓', colors: ['#6BCB77', '#2EC4B6'], soon: true },
  { id: 'desenho', title: 'Adivinha o Desenho', emoji: '🎨', colors: ['#F15BB5', '#9B5DE5'], soon: true },
  { id: 'bingo', title: 'Bingo', emoji: '🎱', colors: ['#FF9F1C', '#FF6B6B'], soon: true },
];

/** Todas as telas de todos os apps: { NomeDaTela: Componente } */
export function collectScreens(apps = APPS) {
  const all = {};
  apps.forEach((app) => {
    Object.entries(app.screens || {}).forEach(([name, comp]) => {
      if (all[name]) throw new Error(`Tela "${name}" registrada duas vezes (app ${app.id})`);
      all[name] = comp;
    });
  });
  return all;
}
