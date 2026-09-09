import { VibeIntroSlide } from "./vibe-intro-slide";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_APP_MAX_WIDTH, MobileOverlayFrame } from "../mobile-app-shell";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { usePalette } from "../reconstruction/ui";

export const ONBOARDING_BACKGROUND = "#101827";
const purple = "#6860F2";
const logo = require("../../../assets/wenitro-logo-transparent.png");
const photos = {
  ride: require("../../../assets/onboarding/reference-motorcycle.png"),
  cycling: require("../../../assets/onboarding/reference-skate.png"),
  friends: require("../../../assets/onboarding/reference-social-impact.png"),
  workout: require("../../../assets/onboarding/reference-workout.png"),
  travel: require("../../../assets/onboarding/reference-travel.png"),
  food: require("../../../assets/onboarding/reference-food.png"),
  hobbies: require("../../../assets/onboarding/reference-hobbies.png"),
  startup: require("../../../assets/onboarding/reference-startup.png"),
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function BrandIcon({ size = 86 }: { size?: number }) {
  const c = usePalette();
  return <View style={{ width: size, height: size, borderRadius: size * .27, backgroundColor: c.inset, borderWidth: 1, borderColor: c.border, padding: size * .045 }}><Image source={logo} accessibilityLabel="WeNitro" style={{ width: "100%", height: "100%" }} resizeMode="contain" /></View>;
}

export function SplashScreen() {
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    const entrance = Animated.timing(enter, { toValue: 1, duration: reduced ? 0 : 450, useNativeDriver: Platform.OS !== "web" });
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== "web" }), Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== "web" })]));
    entrance.start();
    if (!reduced) loop.start();
    return () => { entrance.stop(); loop.stop(); };
  }, [enter, pulse, reduced]);
  return <View style={[s.full, { backgroundColor: purple }]} testID="onboarding-splash">
    <View style={[s.splashOrb, { top: -125, right: -120, width: 385, height: 385 }]} />
    <View style={[s.splashOrb, { bottom: -45, left: -80, width: 270, height: 270 }]} />
    <Animated.View style={[s.splashCenter, { opacity: enter, transform: [{ scale: reduced ? 1 : enter.interpolate({ inputRange: [0, 1], outputRange: [.94, 1] }) }] }]}>
      <Image source={logo} accessibilityLabel="WeNitro" style={s.splashLogo} />
      <Text style={s.splashName}>WeNitro</Text>
      <Text style={s.splashTagline}>Find your perfect partner for every{"\n"}passion</Text>
    </Animated.View>
    <SafeAreaView edges={["bottom"]} style={s.splashDots}><View style={s.dot} /><Animated.View style={[s.dot, { opacity: reduced ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [.45, 1] }), backgroundColor: "white" }]} /><View style={s.dot} /></SafeAreaView>
  </View>;
}

function IntroArtwork() {
  const float = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { float.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.timing(float, { toValue: 1, duration: 2600, useNativeDriver: Platform.OS !== "web" }), Animated.timing(float, { toValue: 0, duration: 2600, useNativeDriver: Platform.OS !== "web" })]));
    loop.start(); return () => loop.stop();
  }, [float, reduced]);
  return <View style={s.artwork} accessibilityLabel="Illustration of WeNitro activity and social cards">
    <View style={s.artGlowPurple} /><View style={s.artGlowCyan} />
    <Animated.View style={[s.artBoard, { transform: [{ rotate: "-18deg" }, { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}>
      <View style={s.artHeader}><Text style={s.artLogo}>W</Text><Text style={s.artBrand}>WeNitro</Text><Ionicons name="notifications-outline" size={22} color="#23CBE0" /></View>
      <View style={s.artRow}>
        <View style={[s.artCard, { borderColor: "#655EE5", transform: [{ translateX: 38 }, { translateY: -28 }] }]}>
          <Text style={s.artUser}>@alex_rides <Text style={s.artMuted}> · 2h ago</Text></Text><Text style={s.artTitle}>Sunset Canyon Run</Text>
          <Image source={photos.ride} style={s.artPhoto} /><Text style={s.artMuted}>Awesome ride with the crew!</Text>
          <View style={s.artStats}><Text style={s.artLike}>♥ 142 Likes</Text><Text style={s.artMuted}>28 Comments</Text></View><View style={s.artDetails}><Text style={s.artUser}>View Details</Text></View>
        </View>
        <View style={[s.artCard, { borderColor: "#409BA6", marginTop: -10, zIndex: 1 }]}>
          <Text style={s.artUser}>@maya.flow <Text style={s.artMuted}> · 2h ago</Text></Text><Text style={s.artTitle}>City Lights Night Skate</Text>
          <Image source={photos.cycling} style={s.artPhoto} /><View style={s.artStats}><Text style={s.artLike}>♥ 98 Likes</Text><Text style={s.artMuted}>28 Comments</Text></View>
          <View style={s.artDetails}><Text style={s.artLike}>♥</Text><Ionicons name="chatbubble-outline" color="#ADB0B8" size={17} /><Ionicons name="arrow-redo" color="#ADB0B8" size={17} /></View>
        </View>
      </View>
      <View style={[s.artCard, s.artSmall]}><Text style={s.artUser}>@Sarah_K</Text><Text style={s.artTitle}>5K Run Completed</Text><Text style={s.artMuted}>5K Run Completed!</Text></View>
      <View style={[s.artCard, { position: "absolute", zIndex: 2, right: -97, bottom: 75, width: 245, borderColor: "#28404A" }]}><Text style={s.artTitle}>Downtown Coffee Meetup</Text><Text style={s.artMuted}>Join us</Text><Text style={[s.artUser, { marginTop: 7 }]}>@Ben_Lee · 2h ago</Text></View>
      <View style={s.artNav}>{["albums-outline", "search-outline", "add-circle-outline", "mail-outline", "person-outline"].map((name, i) => <Ionicons key={name} name={name as keyof typeof Ionicons.glyphMap} color={i ? "#979CA8" : purple} size={23} />)}</View>
    </Animated.View>
    <LinearGradient colors={["transparent", "#090C12"]} style={s.artFade} />
  </View>;
}

export function IntroScreen({ onContinue }: { onContinue: () => void }) {
  const { width, height } = useWindowDimensions();
  const pageWidth = Math.min(width, MOBILE_APP_MAX_WIDTH);
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const finished = useRef(false);
  const exit = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const finish = () => { if (!finished.current) { finished.current = true; Animated.timing(exit, { toValue: 1, duration: reduced ? 0 : 220, useNativeDriver: Platform.OS !== "web" }).start(({ finished: done }) => { if (done) onContinue(); }); } };
  const next = () => {
    if (page === 0) {
      pager.current?.scrollTo({ x: pageWidth, animated: !reduced });
      setPage(1);
      return;
    }
    finish();
  };
  const pageContent = (slide: 0 | 1) => slide === 0 ? <VibeIntroSlide width={pageWidth} height={height} reducedMotion={reduced} onNext={next} onSkip={finish} /> : <View style={[s.introContent, { width: pageWidth, minHeight: height }]}>
    <View style={s.introHeader}><View style={s.brandRow}><Image source={logo} style={{ width: 31, height: 31 }} /><Text style={s.introBrand}><Text style={{ color: purple }}>We</Text>Nitro</Text></View><Pressable onPress={finish} accessibilityRole="button" style={s.skip}><Text style={s.skipText}>Skip</Text></Pressable></View>
    <IntroArtwork />
    <View style={s.introCopy}><Text style={s.introHeadline}>Real Connections{"\n"}<Text style={{ color: purple }}>Start Here</Text></Text><Text style={s.introDescription}>Join activities, meet amazing people, and create <Text style={{ color: purple, fontWeight: "700" }}>unforgettable memories.</Text></Text></View>
    <View style={s.introFooter}><Text style={s.swipe}>⤺  Swipe to explore  ⟶</Text><GradientButton label="Next" onPress={next} arrow /></View>
  </View>;
  return <Animated.View style={{ flex: 1, opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: exit.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }] }}><SafeAreaView style={[s.full, { backgroundColor: "#090C12" }]} edges={["top", "bottom"]}>
    <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false} scrollEventThrottle={16} onScroll={event => setPage(Math.max(0, Math.min(1, Math.round(event.nativeEvent.contentOffset.x / pageWidth))))} onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth))} style={{ width: pageWidth, alignSelf: "center" }} testID="intro-pager">
      {pageContent(0)}
      {pageContent(1)}
    </ScrollView>
  </SafeAreaView></Animated.View>;
}

export function WelcomeScreen({ googleButton, onLegal, error, onFallback }: { onFallback?: () => void; googleButton: React.ReactNode; onLegal: (kind: "terms" | "privacyPolicy") => void; error?: string }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const background = c.isDark ? ["#0B0D18", "#11101D", "#03070A"] : ["#F7F7FB", "#F1F0FA", "#FFFFFF"];
  return <LinearGradient colors={background as [string, string, ...string[]]} locations={[0, .55, 1]} style={s.full}>
    <View style={[s.welcomeOrb, !c.isDark && { backgroundColor: "#DCD8FF", opacity: .7 }]} />
    <ScrollView contentContainerStyle={[s.welcomeContent, { minHeight: height, paddingTop: Math.max(insets.top + 95, height * .22), paddingBottom: Math.max(insets.bottom, 24) + 50 }]} showsVerticalScrollIndicator={false}>
      <BrandIcon /><Text style={[s.welcomeBrand, { color: c.text }]}>WeNitro</Text><Text style={[s.welcomeSubtitle, { color: c.muted }]}>ELEVATE YOUR VIBES</Text>
      <View style={[s.welcomeCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.welcomeTitle, { color: c.text }]}>Welcome 👋</Text>
        <Text style={[s.welcomeSupport, { color: c.muted }]}>Join communities, discover trending activities,{"\n"}and connect with your squad securely.</Text>
        <View style={s.googleSlot}>{googleButton}</View>
        {onFallback ? <Pressable accessibilityRole="button" onPress={onFallback} style={{ minHeight: 44, justifyContent: "center", marginTop: 6 }}><Text style={{ textAlign: "center", color: c.accent, fontSize: 12 }}>Use email or phone instead</Text></Pressable> : null}
        {error ? <Text accessibilityRole="alert" style={[s.error, { color: c.danger }]}>{error}</Text> : null}
        <Text style={[s.legalText, { color: c.muted }]}>By continuing, you agree to our <Text accessibilityRole="link" onPress={() => onLegal("terms")} style={s.legalLink}>Terms &amp; Conditions</Text> and <Text accessibilityRole="link" onPress={() => onLegal("privacyPolicy")} style={s.legalLink}>Privacy Policy</Text></Text>
      </View>
    </ScrollView>
  </LinearGradient>;
}

export function GradientButton({ label, onPress, disabled = false, arrow = false, busy = false }: { label: string; onPress: () => void; disabled?: boolean; arrow?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.gradientButton, { opacity: disabled ? .5 : pressed ? .85 : 1 }]}>
    <LinearGradient colors={[purple, "#13CAE0"]} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={s.gradientFill}>
      {busy ? <ActivityIndicator color="white" /> : <><Text style={s.gradientLabel}>{label}</Text>{arrow && <Ionicons name="arrow-forward" size={26} color="white" />}</>}
    </LinearGradient>
  </Pressable>;
}

export type ProfileSetupValues = { fullName: string; username: string; dateOfBirth: string; gender: string; photoUri?: string };
export function ProfileCompletionScreen({ initial, onSubmit, checkUsername, loading = false }: {
  initial: ProfileSetupValues & { avatarUrl?: string }; onSubmit: (values: ProfileSetupValues) => Promise<void>;
  checkUsername: (value: string) => Promise<{ available: boolean; username: string }>; loading?: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [avatar, setAvatar] = useState(initial.avatarUrl || "");
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const lock = useRef(false);
  const { height } = useWindowDimensions();
  const c = usePalette();
  const set = (key: keyof ProfileSetupValues, value: string) => setValues(current => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!usernameTouched || !values.username.trim()) { setAvailability(""); return; }
    let active = true;
    setAvailability("Checking username…");
    const timer = setTimeout(() => { void checkUsername(values.username).then(result => { if (active) setAvailability(result.available ? "Username available" : "This username is already taken"); }).catch(() => { if (active) setAvailability("Availability could not be checked. Try again before saving."); }); }, 550);
    return () => { active = false; clearTimeout(timer); };
  }, [values.username, usernameTouched, checkUsername]);
  const pickPhoto = async (camera: boolean) => {
    setShowPhotoOptions(false); setPhotoBusy(true); setError("");
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error(camera ? "Allow camera access to take a profile photo." : "Allow photo access to choose your profile image.");
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: .85 };
      const result = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options));
      if (!result.canceled && result.assets[0]?.uri) { setAvatar(result.assets[0].uri); set("photoUri", result.assets[0].uri); }
    } catch { setError("Could not open your photo picker. Check permissions and try again."); }
    finally { setPhotoBusy(false); }
  };
  const submit = async () => {
    if (lock.current || loading || photoBusy) return;
    lock.current = true; setBusy(true); setError("");
    try { await onSubmit(values); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Your profile could not be saved. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <SafeAreaView edges={["top", "bottom"]} style={[s.full, { backgroundColor: c.bg }]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.profileContent, { paddingTop: Math.max(40, Math.min(92, height * .105)) }]} showsVerticalScrollIndicator={false}>
        <View style={[s.avatarCircle, { backgroundColor: c.input, borderColor: c.border }]}>{avatar ? <Image source={{ uri: avatar }} style={s.avatarImage} accessibilityLabel="Selected profile photo" /> : <Ionicons name="person-outline" size={42} color={c.iconMuted} />}<Pressable accessibilityRole="button" accessibilityLabel="Choose or take profile photo" onPress={() => setShowPhotoOptions(true)} disabled={photoBusy || busy} style={s.cameraBadge}>{photoBusy ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="camera-outline" size={17} color="white" />}</Pressable></View>
        <Text style={[s.profileTitle, { color: c.text }]}>Welcome to WeNitro!</Text><Text style={[s.profileSupport, { color: c.muted }]}>Let's complete your profile setup to get you{"\n"}connected.</Text>
        <View style={s.profileFields}>
          <Text style={[s.fieldLabel, { color: c.text }]}>Full Name</Text><View style={[s.inputShell, { backgroundColor: c.input, borderColor: c.border }]}><Ionicons name="person-outline" size={22} color={c.iconMuted} /><TextInput accessibilityLabel="Full Name" autoComplete="name" value={values.fullName} onChangeText={value => set("fullName", value)} style={[s.input, { color: c.text }]} placeholderTextColor={c.muted} placeholder="Full Name" editable={!busy && !loading} /></View>
          <Text style={[s.fieldLabel, { color: c.text }]}>Username</Text><View style={[s.inputShell, { backgroundColor: c.input, borderColor: c.border }]}><Ionicons name="person-outline" size={22} color={c.iconMuted} /><TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} value={values.username} onChangeText={value => { setUsernameTouched(true); set("username", value); }} style={[s.input, { color: c.text }]} placeholderTextColor={c.muted} placeholder="Username" editable={!busy && !loading} /></View>
          {availability ? <Text accessibilityLiveRegion="polite" style={[s.availability, { color: availability === "Username available" ? c.success : c.muted }]}>{availability}</Text> : null}
          <Text style={[s.fieldLabel, { color: c.text }]}>Date of Birth</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose date of birth" onPress={() => setDatePicker(true)} style={[s.inputShell, { backgroundColor: c.input, borderColor: c.border }]} disabled={busy || loading}><Text style={[s.input, { paddingTop: 14, color: values.dateOfBirth ? c.text : c.muted }]}>{values.dateOfBirth || "YYYY-MM-DD"}</Text><Ionicons name="calendar-outline" color={c.accent} size={22} /></Pressable>
          <Text style={[s.genderLabel, { color: c.muted }]}>GENDER</Text><View style={s.genderRow}>{[["Male", "male"], ["Female", "female"], ["Non-binary", "non_binary"], ["Prefer not to say", "prefer_not_to_say"]].map(([label, value]) => <Pressable key={value} accessibilityRole="radio" aria-checked={values.gender === value} accessibilityState={{ checked: values.gender === value }} disabled={busy} onPress={() => set("gender", values.gender === value ? "" : value)} style={[s.genderPill, { borderColor: c.border, backgroundColor: values.gender === value ? (c.isDark ? "#302A65" : "#E9E6FF") : c.bg }, values.gender === value && { borderColor: c.accent }]}><Text style={[s.genderText, { color: values.gender === value ? c.accent : c.text }]}>{label}</Text></Pressable>)}</View>
        </View>
        {error ? <Text accessibilityRole="alert" style={[s.error, { color: c.danger }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Get Started" accessibilityState={{ disabled: busy || loading || photoBusy, busy }} onPress={() => void submit()} disabled={busy || loading || photoBusy} style={s.getStarted}>{busy || loading ? <ActivityIndicator color="white" /> : <Text style={s.getStartedLabel}>Get Started ⚡</Text>}</Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal transparent visible={showPhotoOptions} animationType="fade" onRequestClose={() => setShowPhotoOptions(false)}><MobileOverlayFrame><View style={[s.modalShade, { backgroundColor: c.overlay }]}><View style={[s.modalCard, { backgroundColor: c.sheet }]}><Text style={[s.modalTitle, { color: c.text }]}>Profile photo</Text><Pressable accessibilityRole="button" style={s.modalAction} onPress={() => void pickPhoto(false)}><Text style={[s.genderText, { color: c.text }]}>Choose from library</Text></Pressable>{Platform.OS !== "web" && <Pressable accessibilityRole="button" style={s.modalAction} onPress={() => void pickPhoto(true)}><Text style={[s.genderText, { color: c.text }]}>Take a photo</Text></Pressable>}<Pressable accessibilityRole="button" style={s.modalAction} onPress={() => setShowPhotoOptions(false)}><Text style={{ color: c.accent }}>Cancel</Text></Pressable></View></View></MobileOverlayFrame></Modal>
    {datePicker && Platform.OS !== "web" && <DateTimePicker mode="date" value={values.dateOfBirth ? new Date(`${values.dateOfBirth}T12:00:00`) : new Date(2000, 0, 1)} maximumDate={new Date()} onChange={(event, date) => { setDatePicker(false); if (event.type === "set" && date) set("dateOfBirth", `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`); }} />}
    {datePicker && Platform.OS === "web" && <WebDateDialog value={values.dateOfBirth} onChange={value => { set("dateOfBirth", value); }} onClose={() => setDatePicker(false)} />}
  </SafeAreaView>;
}

function WebDateDialog({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const c = usePalette();
  return <Modal transparent animationType="fade" visible onRequestClose={onClose}><MobileOverlayFrame><View style={[s.modalShade, { backgroundColor: c.overlay }]}><View style={[s.modalCard, { backgroundColor: c.sheet }]}><Text style={[s.modalTitle, { color: c.text }]}>Date of Birth</Text>{React.createElement("input", { type: "date", "aria-label": "Date of Birth", value, max: new Date().toLocaleDateString("en-CA"), onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value), style: { colorScheme: c.mode, padding: 16, borderRadius: 10, border: `1px solid ${c.border}`, background: c.input, color: c.text, fontSize: 18, width: "100%", boxSizing: "border-box" } })}<Pressable accessibilityRole="button" style={s.modalAction} onPress={onClose}><Text style={{ color: c.accent }}>Done</Text></Pressable></View></View></MobileOverlayFrame></Modal>;
}

export function FirstFeedWelcome({ onExplore }: { onExplore: () => void }) {
  const [banner, setBanner] = useState(true);
  return <LinearGradient colors={[ONBOARDING_BACKGROUND, "#07090D"]} style={s.full}><SafeAreaView edges={["top"]} style={{ flex: 1 }}><ScrollView contentContainerStyle={s.firstContent}>
    <View style={{ minHeight: 70 }}>{banner && <View style={s.welcomeBanner}><Ionicons name="checkmark" size={25} color="white" /><Text style={s.bannerLabel}>Welcome to WeNitro! ⚡</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss welcome" onPress={() => setBanner(false)} hitSlop={12}><Ionicons name="close" size={23} color="white" /></Pressable></View>}</View>
    <View style={s.interestScene}><LinearGradient colors={["#6476FA", "#15C4DC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.centralCircle}><Text style={s.centralText}>Find People.{"\n"}Do Something.{"\n"}<Text style={{ color: "#19D4D8" }}>Build Real{"\n"}Connections.</Text></Text></LinearGradient>{[
      { label: "Workout", image: photos.workout, left: "10%", top: 0 }, { label: "Travel", image: photos.travel, left: "77%", top: 0 },
      { label: "Food", image: photos.food, left: "0%", top: 133 }, { label: "Hobbies", image: photos.hobbies, left: "86%", top: 133 },
      { label: "Startup", image: photos.startup, left: "14%", top: 255 }, { label: "Social Impact", image: photos.friends, left: "72%", top: 255 },
    ].map(item => <View key={item.label} style={[s.interestBubble, { left: item.left as `${number}%`, top: item.top }]}><Image source={item.image} style={s.interestImage} /><Text style={s.interestLabel}>{item.label}</Text></View>)}</View>
    <Ionicons name="chevron-down" size={27} color={purple} style={{ alignSelf: "center", marginTop: 22 }} /><Text style={s.vibeQuestion}>What's your vibe today?</Text><GradientButton label="Explore Activities" onPress={onExplore} arrow />
  </ScrollView></SafeAreaView></LinearGradient>;
}

export function FeedLoadingScreen({ error, onRetry, onLogout }: { error?: string; onRetry?: () => void; onLogout?: () => void }) {
  const fade = useRef(new Animated.Value(.45)).current;
  const reduced = useReducedMotion();
  const c = usePalette();
  useEffect(() => { if (reduced) return; const loop = Animated.loop(Animated.sequence([Animated.timing(fade, { toValue: .9, duration: 700, useNativeDriver: Platform.OS !== "web" }), Animated.timing(fade, { toValue: .45, duration: 700, useNativeDriver: Platform.OS !== "web" })])); loop.start(); return () => loop.stop(); }, [fade, reduced]);
  return <SafeAreaView style={[s.full, { backgroundColor: c.bg }]} edges={["top", "bottom"]}><View style={s.skeletonContent} accessibilityLabel={error ? "Feed unavailable" : "Loading your Feed"} accessibilityState={{ busy: !error }}><View style={s.brandRow}><Image source={logo} style={{ width: 28, height: 28 }} /><Text style={[s.artBrand, { color: c.text }]}>WeNitro</Text></View>{error ? <><Text style={[s.error, { color: c.danger }]}>{error}</Text><GradientButton label="Try again" onPress={() => onRetry?.()} /><Pressable onPress={onLogout} accessibilityRole="button"><Text style={[s.legalLink, { color: c.accent }]}>Return to Welcome</Text></Pressable></> : <Animated.View style={{ opacity: reduced ? .65 : fade, gap: 16 }}>{[0, 1].map(i => <View key={i} style={{ gap: 10 }}><View style={[s.skeletonImage, { backgroundColor: c.card }]} /><View style={[s.skeletonLine, { width: "75%", backgroundColor: c.card }]} /><View style={[s.skeletonLine, { width: "42%", backgroundColor: c.card }]} /><View style={[s.skeletonLine, { width: "55%", backgroundColor: c.card }]} /></View>)}</Animated.View>}</View></SafeAreaView>;
}

const s = StyleSheet.create({
  full: { flex: 1, width: "100%", maxWidth: MOBILE_APP_MAX_WIDTH, alignSelf: "center", overflow: "hidden" },
  splashOrb: { position: "absolute", borderRadius: 300, backgroundColor: "rgba(255,255,255,.07)" },
  splashCenter: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 9 },
  splashLogo: { width: 144, height: 144 }, splashName: { color: "white", fontSize: 39, fontWeight: "700", letterSpacing: 2, marginTop: 20 }, splashTagline: { color: "#EEEAFE", fontSize: 17, lineHeight: 22, letterSpacing: 1, textAlign: "center", marginTop: 17 },
  splashDots: { position: "absolute", bottom: 55, alignSelf: "center", flexDirection: "row", gap: 9 }, dot: { width: 9, height: 9, borderRadius: 6, backgroundColor: "#BBB5F8" },
  introContent: { paddingHorizontal: 23, paddingTop: 23, paddingBottom: 24 }, introHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 }, brandRow: { flexDirection: "row", alignItems: "center", gap: 7 }, introBrand: { color: "white", fontSize: 23, fontWeight: "800" }, skip: { paddingVertical: 9, paddingHorizontal: 17, borderRadius: 24, backgroundColor: "#1B1C20", borderWidth: 1, borderColor: "#35363A" }, skipText: { color: "white", fontSize: 14, fontWeight: "600" },
  artwork: { height: 445, marginHorizontal: -23, marginTop: 14, overflow: "hidden" }, artGlowPurple: { position: "absolute", backgroundColor: "#4234A7", boxShadow: "0 0 65px 30px #4234A7", opacity: .08, width: 320, height: 360, borderRadius: 180, left: -30, top: 60 }, artGlowCyan: { position: "absolute", backgroundColor: "#1C7582", boxShadow: "0 0 65px 30px #1C7582", opacity: .08, width: 270, height: 380, borderRadius: 180, right: -55, top: 20 }, artBoard: { width: 430, left: -15, top: 110, padding: 12, borderRadius: 18, backgroundColor: "#151D26", borderWidth: 1, borderColor: "#253F4B" }, artHeader: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 14 }, artLogo: { color: "#6474FF", fontSize: 28, fontWeight: "900" }, artBrand: { color: "#ECECF5", fontSize: 17, fontWeight: "700", flex: 1 }, artRow: { zIndex: 1, flexDirection: "row", gap: 9 }, artCard: { width: 195, padding: 10, borderRadius: 14, borderWidth: 1, backgroundColor: "#111820" }, artUser: { color: "#BDC1CC", fontSize: 10, fontWeight: "600" }, artTitle: { color: "#F0F1F5", fontSize: 13, fontWeight: "700", marginVertical: 6 }, artPhoto: { width: "100%", height: 106, borderRadius: 10, marginBottom: 7 }, artMuted: { color: "#7F858F", fontSize: 10 }, artStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, artLike: { color: "#7662F7", fontSize: 11 }, artDetails: { backgroundColor: "#282D33", borderColor: "#444951", borderWidth: 1, borderRadius: 16, padding: 7, marginTop: 9, alignItems: "center", flexDirection: "row", justifyContent: "space-evenly" }, artSmall: { zIndex: 1, marginTop: -18, marginLeft: 110, width: 195, borderColor: "#333243" }, artNav: { flexDirection: "row", justifyContent: "space-evenly", paddingVertical: 13 }, artFade: { height: 60, bottom: 0, left: 0, right: 0, position: "absolute" },
  introCopy: { marginHorizontal: 7, marginTop: -3 }, introHeadline: { color: "#FFF", fontSize: 35, fontWeight: "800", lineHeight: 42, letterSpacing: -1 }, introDescription: { fontSize: 15, lineHeight: 23, color: "#AEB0B7", marginTop: 14 }, introFooter: { marginTop: "auto", paddingTop: 28 }, swipe: { color: "#756BFA", textAlign: "center", fontSize: 14, fontWeight: "600", fontStyle: "italic", marginBottom: 22 },
  welcomeOrb: { position: "absolute", width: 288, height: 288, top: -65, left: -51, borderRadius: 170, backgroundColor: "#211B53", opacity: .65 }, welcomeContent: { alignItems: "center", paddingHorizontal: 21 }, welcomeBrand: { color: "#F9F9FC", fontSize: 31, fontWeight: "800", marginTop: 31 }, welcomeSubtitle: { fontSize: 13, color: "#9CA0AB", fontWeight: "700", letterSpacing: 1.4, marginTop: 5 }, welcomeCard: { width: "100%", backgroundColor: "#181927", borderRadius: 30, borderWidth: 1.5, borderColor: "#30313F", paddingHorizontal: 30, paddingTop: 32, paddingBottom: 32, marginTop: 40 }, welcomeTitle: { textAlign: "center", color: "white", fontSize: 27, fontWeight: "700" }, welcomeSupport: { color: "#AAACB8", textAlign: "center", fontSize: 13, lineHeight: 21, marginTop: 10, marginHorizontal: -12 }, googleSlot: { marginTop: 39, minHeight: 54 }, legalText: { color: "#AAADBA", fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 26, marginHorizontal: -5 }, legalLink: { color: "#8981FA", textDecorationLine: "underline", fontWeight: "600" },
  gradientButton: { borderRadius: 30, overflow: "hidden", minHeight: 51 }, gradientFill: { minHeight: 51, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12, paddingHorizontal: 15, paddingVertical: 12 }, gradientLabel: { fontSize: 17, color: "white", fontWeight: "700" },
  profileContent: { paddingHorizontal: 23, paddingBottom: 50, alignItems: "center" }, avatarCircle: { width: 91, height: 91, borderRadius: 48, backgroundColor: "#202938", borderWidth: 1.5, borderColor: "#39414F", alignItems: "center", justifyContent: "center" }, avatarImage: { width: "100%", height: "100%", borderRadius: 48 }, cameraBadge: { width: 27, height: 27, borderRadius: 16, borderWidth: 1.5, borderColor: "white", backgroundColor: purple, position: "absolute", right: -2, bottom: -2, alignItems: "center", justifyContent: "center" }, profileTitle: { color: "#F9FAFB", fontSize: 26, fontWeight: "700", marginTop: 13, textAlign: "center" }, profileSupport: { fontSize: 14, lineHeight: 19, color: "#969CA8", textAlign: "center", marginTop: 6 }, profileFields: { width: "100%", marginTop: 29 }, fieldLabel: { color: "#F0F2F6", fontSize: 12, fontWeight: "500", marginTop: 7, marginBottom: 9 }, inputShell: { flexDirection: "row", alignItems: "center", backgroundColor: "#202A39", borderWidth: 1, borderColor: "#3A4352", borderRadius: 12, minHeight: 48, paddingHorizontal: 11, gap: 9, marginBottom: 17 }, input: { color: "#F7F8FC", fontSize: 14, flex: 1, minHeight: 46, paddingVertical: 8 }, availability: { fontSize: 11, marginTop: -10, marginBottom: 8 }, genderLabel: { color: "#8E96A3", fontSize: 12, letterSpacing: .6, marginTop: 15, marginBottom: 11 }, genderRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, genderPill: { minHeight: 42, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: "#414B5B", justifyContent: "center" }, genderSelected: { borderColor: purple, backgroundColor: "#302A65" }, genderText: { color: "#F3F4F7", fontSize: 12 }, getStarted: { width: "100%", backgroundColor: purple, borderRadius: 13, minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 26, paddingVertical: 12 }, getStartedLabel: { fontSize: 14, fontWeight: "700", color: "white" }, error: { color: "#FDA4AF", fontSize: 12, lineHeight: 18, marginTop: 12 },
  modalShade: { flex: 1, backgroundColor: "rgba(0,0,0,.65)", alignItems: "center", justifyContent: "center", padding: 25 }, modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#192233", borderRadius: 20, padding: 22, gap: 12 }, modalTitle: { fontSize: 20, color: "white", fontWeight: "600" }, modalAction: { minHeight: 45, alignItems: "center", justifyContent: "center" },
  firstContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 115 }, welcomeBanner: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 49, backgroundColor: "#0FBA87", borderRadius: 13, paddingHorizontal: 13 }, bannerLabel: { flex: 1, fontSize: 14, color: "white", fontWeight: "600" }, interestScene: { height: 347, width: "100%", maxWidth: 358, alignSelf: "center", marginTop: 43 }, centralCircle: { position: "absolute", width: 206, height: 206, borderRadius: 110, alignSelf: "center", top: 62, justifyContent: "center", alignItems: "center" }, centralText: { color: "white", textAlign: "center", fontSize: 21, lineHeight: 27, fontWeight: "700" }, interestBubble: { position: "absolute", width: 60, alignItems: "center", marginLeft: -5 }, interestImage: { width: 57, height: 57, borderRadius: 30, borderWidth: 1.5, borderColor: purple }, interestLabel: { color: "#A3A7B0", fontSize: 11, fontWeight: "500", textAlign: "center", marginTop: 7, width: 84 }, vibeQuestion: { color: "#F9FAFC", fontSize: 19, fontWeight: "700", textAlign: "center", marginTop: 18, marginBottom: 22 },
  skeletonContent: { padding: 18, gap: 25 }, skeletonImage: { height: 230, backgroundColor: "#343944", borderRadius: 18 }, skeletonLine: { height: 12, backgroundColor: "#343944", borderRadius: 3 },
});
