import { supabase } from '../lib/supabase';
import { AADHAAR_ACTIONS, type DigiLockerAction } from '../../supabase/functions/_shared/aadhaar-actions';

export const AADHAAR_CONSENT_VERSION = 'wenitro-aadhaar-digilocker-sdk-v1';

export type AadhaarVerificationState = {
  available: boolean;
  verified: boolean;
  status: string;
  testMode?: boolean;
  sessionId?: string;
  publicApiKey?: string;
  message?: string;
};

const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicKeyPattern = /^key_(?:live|test)_[A-Za-z0-9_-]{8,}$/;

async function invoke(
  action: DigiLockerAction,
  consent = false,
): Promise<AadhaarVerificationState> {
  const { data, error } = await supabase.functions.invoke('aadhaar-verification', {
    body: {
      action,
      ...(action === AADHAAR_ACTIONS.begin
        ? { consent, consentVersion: AADHAAR_CONSENT_VERSION }
        : {}),
    },
  });
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
  if (
    !data ||
    typeof data.available !== 'boolean' ||
    typeof data.verified !== 'boolean' ||
    typeof data.status !== 'string'
  ) {
    throw new Error('Aadhaar verification returned an invalid result.');
  }
  if (action === AADHAAR_ACTIONS.begin || data.sessionId !== undefined || data.publicApiKey !== undefined) {
    if (
      typeof data.sessionId !== 'string' ||
      !sessionPattern.test(data.sessionId) ||
      typeof data.publicApiKey !== 'string' ||
      !publicKeyPattern.test(data.publicApiKey)
    ) {
      throw new Error('DigiLocker returned an invalid launch session.');
    }
  }
  return data as AadhaarVerificationState;
}

export const aadhaarVerificationService = {
  availability: () => invoke(AADHAAR_ACTIONS.availability),
  begin: (consent: boolean) => invoke(AADHAAR_ACTIONS.begin, consent),
  refresh: () => invoke(AADHAAR_ACTIONS.refresh),
};
