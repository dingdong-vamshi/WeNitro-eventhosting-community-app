import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const background = '#090C12';
const accent = '#6860F2';
const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const artwork = require('../../../assets/onboarding/vibes-phone-reference.png');
const logo = require('../../../assets/onboarding/vibes-brand-mark.png');

/** Slide 1 owns its composition so shared onboarding/Slide 2 styles cannot drift. */
export function VibeIntroSlide({ width, height, reducedMotion, onNext, onSkip }: {
  width: number; height: number; reducedMotion: boolean; onNext: () => void; onSkip: () => void;
}) {
  const hero = useRef(new Animated.Value(0)).current;
  const copy = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const scale = width / 390;
  useEffect(() => {
    const entrance = Animated.stagger(reducedMotion ? 0 : 110, [hero, copy, footer].map(value =>
      Animated.timing(value, { toValue: 1, duration: reducedMotion ? 0 : 620,
        easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' })));
    entrance.start();
    return () => entrance.stop();
  }, [hero, copy, footer, reducedMotion]);
  const reveal = (value: Animated.Value, distance: number) => ({
    opacity: reducedMotion ? 1 : value,
    transform: [{ translateY: reducedMotion ? 0 : value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  });
  return <View testID="vibe-intro-slide" style={{ width, height, overflow: 'hidden', backgroundColor: background }}>
    <View style={[s.header, { top: height * .057, left: width * .052, right: width * .048 }]}>
      <View style={s.brand}>
        <Image source={logo} style={{ width: 27 * scale, height: 27 * scale }} resizeMode="contain" />
        <Text style={[s.brandText, { fontSize: 20 * scale }]}><Text style={{ color: accent }}>We</Text>Nitro</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8} style={[s.skip, { width: 57 * scale, height: 30 * scale }]}>
        <Text style={[s.skipText, { fontSize: 14 * scale }]}>Skip</Text>
      </Pressable>
    </View>
    <Animated.View pointerEvents="none" testID="vibe-intro-hero" style={[s.hero, { top: height * .18, left: -width * .018, width: width * 1.035, height: width * 1.117 }, reveal(hero, 14), { transform: [
      { translateY: reducedMotion ? 0 : hero.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
      { scale: reducedMotion ? 1 : hero.interpolate({ inputRange: [0, 1], outputRange: [.975, 1] }) },
    ] }]}>
      <Image source={artwork} accessibilityLabel="Tilted Vibes phone with a neon-lit dancer and three stacked video cards" style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      <LinearGradient colors={[background, 'transparent']} style={[s.heroFade, { top: 0, bottom: undefined, height: '4%' }]} />
      <LinearGradient colors={['transparent', background]} style={s.heroFade} />
    </Animated.View>
    <Animated.View style={[s.copy, { top: height * .64, left: width * .07, right: width * .06 }, reveal(copy, 8)]}>
      <Text testID="vibe-intro-headline" style={[s.headline, { fontSize: 32 * scale, lineHeight: 40 * scale }]}>Share Your Vibe{'\n'}<Text style={{ color: accent }}>With the World</Text></Text>
      <Text testID="vibe-intro-description" style={[s.description, { position: 'absolute', top: height * .103, left: 0, right: 0, fontSize: 15.1 * scale, lineHeight: 22 * scale }]}>Post videos, pictures, and check out what your{'\n'}<Text style={{ color: accent, fontWeight: '700' }}>squad</Text> is hosting and participating in.</Text>
    </Animated.View>
    <Animated.View style={[s.footer, { left: width * .052, right: width * .048, bottom: height * .052 }, reveal(footer, 5)]}>
      <Text testID="vibe-intro-swipe" style={[s.swipe, { fontSize: 15 * scale, marginBottom: 19 * scale }]}>⤺  Swipe to explore  ⟶</Text>
      <Pressable accessibilityRole="button" onPress={onNext} style={({ pressed }) => ({ borderRadius: 40, overflow: 'hidden', opacity: pressed ? .85 : 1 })}>
        <LinearGradient colors={['#6860F2', '#438DEC', '#13CAE0']} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={[s.next, { height: 49 * scale }]}>
          <Text style={[s.nextText, { fontSize: 17 * scale }]}>Next</Text><Ionicons name="arrow-forward" size={23 * scale} color="white" />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  header: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { color: '#FFF', fontFamily: serif, fontWeight: '700', letterSpacing: -.6 },
  skip: { borderRadius: 24, backgroundColor: '#1B1C20', borderWidth: 1, borderColor: '#35363A', alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFF', fontFamily: serif, fontWeight: '700' },
  hero: { position: 'absolute' },
  heroFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '7%' },
  copy: { position: 'absolute' },
  headline: { color: '#FFF', fontFamily: serif, fontWeight: '700', letterSpacing: -.6 },
  description: { color: '#B7B7BF', fontFamily: serif },
  footer: { position: 'absolute' },
  swipe: { color: accent, fontFamily: serif, fontStyle: 'italic', fontWeight: '700', textAlign: 'center' },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextText: { color: '#FFF', fontFamily: serif, fontWeight: '700' },
});
