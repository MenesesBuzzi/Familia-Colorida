import { createContext, useContext } from 'react';

// Navegação simples em pilha (sem bibliotecas extras, roda liso no Expo Go).
export const NavContext = createContext({
  push: () => {},
  replace: () => {},
  back: () => {},
  reset: () => {},
  user: null,
  nickname: '',
  setNickname: () => {},
});

export const useNav = () => useContext(NavContext);
