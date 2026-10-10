import React from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatScreen } from './src/ChatScreen';
import { navigationRef, type RootStackParamList } from './src/navigation';
import { setUpPush } from './src/push';

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  return (
    <View style={styles.home}>
      <Button title="Chat with us" onPress={() => navigation.navigate('Chat')} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Push is set up once navigation is ready, so a tap that started the app can open the chat. */}
      <NavigationContainer ref={navigationRef} onReady={() => setUpPush().catch(console.warn)}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My app' }} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  home: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
