import { createContext, useContext } from 'react';

// Áudio global (Rádio tocando em qualquer tela + walkie-talkie). Implementado em AudioProvider.js.
export const AudioContext = createContext({
  radio: { roomId: null, room: null, isOwner: false, suspended: false, voiceNow: null },
  tuneIn: () => {},
  tuneOut: () => {},
  suspendRadio: () => {},
  resumeRadio: () => {},
  setDuck: () => {},
  control: async () => {},
  refreshRoom: () => {},
});

export const useAudio = () => useContext(AudioContext);

// Posição/duração do player (muda a cada segundo): contexto separado para não redesenhar o app inteiro.
export const AudioStatusContext = createContext(null);
export const useAudioStatus = () => useContext(AudioStatusContext);
