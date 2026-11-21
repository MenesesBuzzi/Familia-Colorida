import AsyncStorage from '@react-native-async-storage/async-storage';

const NICK_KEY = 'fc:nickname';

export async function getNickname() {
  return (await AsyncStorage.getItem(NICK_KEY)) || '';
}

export async function saveNickname(nick) {
  await AsyncStorage.setItem(NICK_KEY, (nick || '').trim());
}
