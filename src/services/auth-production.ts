import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  username?: string;
  emailRedirectTo?: string;
};

export type PasswordLoginInput = {
  email: string;
  password: string;
};

export type PhoneOtpRequestInput = {
  phone: string;
  fullName?: string;
  createAccount?: boolean;
};

export type PhoneOtpVerifyInput = {
  phone: string;
  token: string;
};

export type GoogleOAuthOptions = {
  redirectTo?: string;
  queryParams?: Record<string, string>;
  scopes?: string;
  openUrl?: (url: string) => Promise<unknown>;
};

export type SessionBootstrap =
  | {
      status: "anonymous";
      session: null;
      user: null;
      profile: null;
    }
  | {
      status: "authenticated";
      session: Session;
      user: User;
      profile: null;
    };

export type OAuthRedirectResult =
  | { handled: false; session: null }
  | { handled: true; session: Session };

export type VerificationStatus = {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  trustScore: number;
};

const requireBackend = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured for this build.");
  }
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const normalizeIndianPhone = (phone: string) => {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }
  return `+91${digits}`;
};

const normalizeUsername = (username: string) =>
  username.trim().replace(/^@/, "").toLowerCase();

const webRedirectUrl = () => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
};

export const getAuthRedirectUrl = () =>
  Platform.OS === "web"
    ? webRedirectUrl() ?? Linking.createURL("auth/callback")
    : Linking.createURL("auth/callback");

const getUrlParameters = (url: string) => {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  fragment.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
};

const clearWebAuthParameters = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["code", "error", "error_code", "error_description"].forEach((key) =>
    url.searchParams.delete(key),
  );
  url.hash = "";
  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}`,
  );
};

const getValidatedUser = async () => {
  requireBackend();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication required.");
  return data.user;
};

export async function handleAuthRedirect(
  url: string,
): Promise<OAuthRedirectResult> {
  requireBackend();
  const params = getUrlParameters(url);
  const errorDescription =
    params.get("error_description") ??
    params.get("error") ??
    params.get("error_code");
  if (errorDescription) throw new Error(errorDescription);

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) {
      throw new Error("OAuth callback did not create a session.");
    }
    clearWebAuthParameters();
    return { handled: true, session: data.session };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return { handled: false, session: null };

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error("OAuth callback did not create a session.");
  }
  clearWebAuthParameters();
  return { handled: true, session: data.session };
}

export function subscribeToAuthRedirects(
  onSession: (session: Session) => void,
  onError: (error: Error) => void = () => undefined,
) {
  const subscription = Linking.addEventListener("url", ({ url }) => {
    void handleAuthRedirect(url)
      .then((result) => {
        if (result.handled) onSession(result.session);
      })
      .catch((error: unknown) =>
        onError(error instanceof Error ? error : new Error(String(error))),
      );
  });
  return () => subscription.remove();
}

export async function bootstrapSession(): Promise<SessionBootstrap> {
  requireBackend();
  let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      const redirect = await handleAuthRedirect(initialUrl);
      if (redirect.handled) {
        sessionData = { session: redirect.session };
      }
    }
  }
  if (!sessionData.session) {
    return { status: "anonymous", session: null, user: null, profile: null };
  }

  const user = await getValidatedUser();
  return {
    status: "authenticated",
    session: { ...sessionData.session, user },
    user,
    profile: null,
  };
}

export async function signUpWithPassword(input: SignUpInput) {
  requireBackend();
  const email = normalizeEmail(input.email);
  const username = input.username
    ? normalizeUsername(input.username)
    : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: input.emailRedirectTo ?? getAuthRedirectUrl(),
      data: {
        full_name: input.fullName.trim(),
        ...(username ? { username } : {}),
      },
    },
  });
  if (error) throw error;

  return {
    user: data.user,
    session: data.session,
    profile: null,
    verificationRequired: Boolean(data.user && !data.session),
  };
}

export async function loginWithPassword(input: PasswordLoginInput) {
  requireBackend();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
  });
  if (error) throw error;
  return data;
}

export async function requestPhoneOtp(input: PhoneOtpRequestInput) {
  requireBackend();
  const phone = normalizeIndianPhone(input.phone);
  const fullName = input.fullName?.trim();
  if (input.createAccount && !fullName) {
    throw new Error("Full name is required to create an account.");
  }
  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: Boolean(input.createAccount),
      ...(fullName ? { data: { full_name: fullName } } : {}),
    },
  });
  if (error) throw error;
  return { data, phone };
}

export async function verifyPhoneOtp(input: PhoneOtpVerifyInput) {
  requireBackend();
  const phone = normalizeIndianPhone(input.phone);
  const token = input.token.replace(/\D/g, "");
  if (!/^\d{6}$/.test(token)) throw new Error("Enter the 6-digit OTP.");
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
  if (error) throw error;
  if (!data.session) throw new Error("OTP verification did not create a session.");
  return data;
}

export async function signInWithGoogle(options: GoogleOAuthOptions = {}) {
  requireBackend();
  const redirectTo = options.redirectTo ?? getAuthRedirectUrl();
  const isWeb = Platform.OS === "web";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: options.scopes,
      queryParams: options.queryParams,
      skipBrowserRedirect: !isWeb,
    },
  });
  if (error) throw error;

  if (!isWeb) {
    if (!data.url) {
      throw new Error("Google OAuth did not return a provider URL.");
    }
    await (options.openUrl ?? Linking.openURL)(data.url);
  }
  return { providerUrl: data.url, redirectTo };
}

export async function logout(scope: "local" | "global" | "others" = "local") {
  requireBackend();
  const { error } = await supabase.auth.signOut({ scope });
  if (error) throw error;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  requireBackend();
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

export async function requestEmailVerification(input?: {
  email?: string;
  redirectTo?: string;
}) {
  requireBackend();
  let email = input?.email ? normalizeEmail(input.email) : undefined;
  if (!email) email = (await getValidatedUser()).email;
  if (!email) throw new Error("An email address is required for verification.");

  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: input?.redirectTo ?? getAuthRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

export async function getVerificationStatus(): Promise<VerificationStatus> {
  const user = await getValidatedUser();
  const { data: profile, error } = await supabase
    .from("tbl_users")
    .select("rating")
    .eq("auth_user_id", user.id)
    .eq("is_delete", 0)
    .maybeSingle();
  if (error) throw error;
  return {
    userId: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    emailVerifiedAt: user.email_confirmed_at ?? null,
    phone: user.phone ?? null,
    phoneVerified: Boolean(user.phone_confirmed_at),
    phoneVerifiedAt: user.phone_confirmed_at ?? null,
    trustScore: Number(profile?.rating ?? 0),
  };
}

export const authProductionService = {
  bootstrapSession,
  signUpWithPassword,
  loginWithPassword,
  requestPhoneOtp,
  verifyPhoneOtp,
  normalizeIndianPhone,
  signInWithGoogle,
  handleAuthRedirect,
  subscribeToAuthRedirects,
  logout,
  onAuthStateChange,
  requestEmailVerification,
  getVerificationStatus,
};
