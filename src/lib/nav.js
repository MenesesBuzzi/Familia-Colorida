import { createContext, useContext } from 'react';

// Navegação simples em pilha (sem bibliotecas extras, roda liso no Expo Go).
export const NavContext = createContext({
  push: () => {},
  replace: () => {},
  back: () => {},
  reset: () => {},
  user: null,
  profile: null,
  nickname: '',
  avatarUrl: null,
  setNickname: () => {},
});

export const useNav = () => useContext(NavContext);
