// Isolated component QA entry. Never imported by index.ts or the application.
// No Supabase client, identity creation, payment, upload or social-data calls.
import { registerRootComponent } from "expo";
import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SplashScreen, IntroScreen, WelcomeScreen, ProfileCompletionScreen, FirstFeedWelcome, FeedLoadingScreen } from "../src/components/onboarding/reference-screens";
import { validateOnboardingDateOfBirth, validateOnboardingUsername } from "../src/utils/onboarding";

function Preview() {
  if (!__DEV__) throw new Error("Component preview must not run in a production bundle.");
  const [screen, setScreen] = useState(new URLSearchParams(window.location.search).get("screen") || "intro");
  const busy = screen === "loading";
  const button = <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={busy} onPress={() => setScreen("loading")} style={{ height: 54, borderRadius: 14, backgroundColor: "white", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12 }}>{busy ? <ActivityIndicator color="#374151" /> : <><Image source={require("../assets/google-g-logo.png")} style={{ width: 20, height: 20 }} /><Text style={{ fontSize: 16, fontWeight: "600" }}>Continue with Google</Text></>}</Pressable>;
  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: "#101827" }}>{screen === "splash" ? <SplashScreen /> : screen === "intro" ? <IntroScreen onContinue={() => setScreen("welcome")} /> : screen === "profile" ? <ProfileCompletionScreen initial={{ fullName: "Atharv Ronghe", username: "atharvronghe", dateOfBirth: "", gender: "" }} checkUsername={async value => ({ available: value !== "reserved", username: value })} onSubmit={async values => { if (!values.fullName.trim()) throw new Error("Full name is required."); validateOnboardingUsername(values.username); validateOnboardingDateOfBirth(values.dateOfBirth); setScreen("firstFeed"); }} /> : screen === "firstFeed" ? <FirstFeedWelcome onExplore={() => setScreen("skeleton")} /> : screen === "skeleton" ? <FeedLoadingScreen /> : <WelcomeScreen googleButton={button} onLegal={kind => setScreen(kind)} />}</View></SafeAreaProvider>;
}
registerRootComponent(Preview);
