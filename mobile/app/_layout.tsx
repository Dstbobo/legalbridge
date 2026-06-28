import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/services/auth.service';
import { lightTheme, darkTheme } from '@/constants/theme';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuthStore();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (segments.length === 0) return;

    const inAuth = segments[0] === '(auth)';
    const inLegal = segments[0] === '(legal)';
    const currentScreen = segments[1] as string | undefined;
    const onboardingScreens = ['onboarding-role', 'onboarding-details'];

    if (inLegal) return;

    if (!isAuthenticated && !inAuth) {
      router.replace('/(auth)/landing');
    } else if (isAuthenticated && inAuth) {
      if (needsOnboarding) {
        if (!onboardingScreens.includes(currentScreen ?? '')) {
          router.replace('/(auth)/onboarding-role');
        }
      } else {
        router.replace('/(main)/chat');
      }
    }
  }, [isAuthenticated, isLoading, needsOnboarding, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
    // Keep Supabase session alive
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        import('@/stores/auth.store').then(({ useAuthStore }) => {
          const store = useAuthStore.getState();
          if (store.user) {
            // silently refresh stored token
            import('expo-secure-store').then((SS) => {
              SS.setItemAsync('lb_auth_token', session.access_token).catch(() => {});
            });
          }
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <PaperProvider theme={theme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(main)" />
              <Stack.Screen name="(legal)" />
            </Stack>
          </AuthGuard>
        </PaperProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
