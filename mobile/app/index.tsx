import React, { useEffect, useRef } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';

const LB_LOGO = require('@/assets/logo.png');

/**
 * Entry gate + seamless animated launch.
 *
 * The native splash already shows the still owl (same size, same position), so
 * the FIRST thing the user ever sees is the owl — no blank navy. When JS takes
 * over, the owl does NOT restart or spin in: it is already on screen and simply
 * comes alive — the glow blooms behind it, it breathes, and the wordmark fades
 * in. Once auth is known we route straight to the right screen.
 */
export default function Index() {
  const { isLoading, isAuthenticated, needsOnboarding } = useAuthStore();

  // Quick flourish only — never a held ceremony that delays the user.
  const [minTimeDone, setMinTimeDone] = React.useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 800);
    return () => clearTimeout(t);
  }, []);

  const glowIn = useRef(new Animated.Value(0)).current;   // glow bloom
  const breathe = useRef(new Animated.Value(0)).current;  // gentle pulse
  const wordmark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(glowIn, {
      toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });
    Animated.timing(wordmark, {
      toValue: 1, duration: 400, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [glowIn, breathe, wordmark]);

  if (isLoading || !minTimeDone) {
    const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
    const glowOpacity = Animated.multiply(glowIn, breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] }));

    return (
      <View style={styles.root}>
        <LinearGradient
          colors={['#060d22', '#0d1b3e', '#12275c', '#0d1b3e']}
          locations={[0, 0.45, 0.75, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Owl pinned dead-centre — exactly where the native splash drew it, so
            the handoff is invisible. The wordmark hangs below without shifting it. */}
        <View style={styles.centerFill} pointerEvents="none">
          <View style={styles.logoWrap}>
            <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: breatheScale }] }]} />
            <Animated.Image
              source={LB_LOGO}
              resizeMode="contain"
              style={[styles.logo, { transform: [{ translateX: -16 }, { scale: breatheScale }] }]}
            />
          </View>
        </View>
        <Animated.View
          style={[styles.wordmarkWrap, {
            opacity: wordmark,
            transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }]}
        >
          <Text style={styles.wordmark}>
            <Text style={{ color: '#ffffff' }}>Legal</Text>
            <Text style={{ color: COLORS.accent, fontStyle: 'italic' }}>Bridge</Text>
          </Text>
          <Text style={styles.tagline}>AI Legal Assistant for Nigeria</Text>
        </Animated.View>
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/(auth)/landing" />;
  if (needsOnboarding) return <Redirect href="/(auth)/onboarding-role" />;
  return <Redirect href="/(main)/chat" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1b3e' },
  centerFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 340, height: 340, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    top: 0, left: 0,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: '#3b6fd4',
    shadowColor: '#5b8ff0', shadowOpacity: 0.9, shadowRadius: 60, shadowOffset: { width: 0, height: 0 },
    elevation: 24,
  },
  logo: { width: 200, height: 200 },
  wordmarkWrap: { position: 'absolute', top: '50%', left: 0, right: 0, marginTop: 130, alignItems: 'center' },
  wordmark: { fontSize: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },
  tagline: { marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', letterSpacing: 0.3 },
});
