import { createNavigationContainerRef } from '@react-navigation/native';

export type RootStackParamList = {
  Home: undefined;
  Chat: undefined;
};

/** Lets a push tap open the chat from outside any screen. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Opens a fresh chat screen above Home. A new screen loads a new signed session,
 * and the chat shows the messages the user missed. There is only ever one chat screen.
 */
export function openChat(): void {
  if (!navigationRef.isReady()) {
    return;
  }
  navigationRef.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Chat' }] });
}
