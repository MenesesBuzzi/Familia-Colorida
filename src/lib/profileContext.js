import { createContext, useContext } from 'react';

// Perfil do usuário logado (tabela profiles): { id, nickname, avatar_url }.
export const ProfileContext = createContext({
  profile: null,
  setProfile: () => {},
  reloadProfile: async () => {},
});

export const useProfile = () => useContext(ProfileContext);
