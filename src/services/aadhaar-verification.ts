import { supabase } from '../lib/supabase';

export const AADHAAR_CONSENT_VERSION = 'wenitro-aadhaar-okyc-v1';

export type AadhaarVerificationState = {
  available: boolean;
  verified: boolean;
  status: string;
  testMode?: boolean;
  reason?: string;
  maskedAadhaar?: string;
  message?: string;
};

async function invoke(body: Record<string, unknown>): Promise<AadhaarVerificationState> {
  const { data, error } = await supabase.functions.invoke('aadhaar-verification', { body });
  if (error) {
    let message = 'Aadhaar verification could not continue. Please try again.';
    if ('context' in error && error.context instanceof Response) {
      try {
        const response = await error.context.json();
        if (typeof response.error === 'string') message = response.error;
      } catch {
        // Keep the fixed, non-sensitive fallback.
      }
    }
    throw new Error(message);
  }
  if (!data || typeof data.available !== 'boolean' || typeof data.verified !== 'boolean' || typeof data.status !== 'string') {
    throw new Error('Aadhaar verification returned an invalid result.');
  }
  return data as AadhaarVerificationState;
}

export const aadhaarVerificationService = {
  availability: () => invoke({ action: 'availability' }),
  sendOtp: (aadhaarNumber: string, consent: boolean) => invoke({
    action: 'sendOtp', aadhaarNumber, consent, consentVersion: AADHAAR_CONSENT_VERSION,
  }),
  verifyOtp: (otp: string) => invoke({ action: 'verifyOtp', otp }),
};
