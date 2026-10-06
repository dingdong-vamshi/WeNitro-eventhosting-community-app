import { supabase } from '../lib/supabase';

export type SafetyReportTarget = 'user' | 'community';
export type SafetyReportReason = {
  value: string;
  label: string;
};

export const USER_REPORT_REASONS: SafetyReportReason[] = [
  { value: 'harassment_or_bullying', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake_account_or_impersonation', label: 'Fake account or impersonation' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'suspicious_behaviour', label: 'Suspicious behaviour' },
  { value: 'other', label: 'Other' },
];

export const COMMUNITY_REPORT_REASONS: SafetyReportReason[] = [
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake_or_misleading_community', label: 'Fake or misleading Community' },
  { value: 'hate_or_abusive_content', label: 'Hate or abusive content' },
  { value: 'other', label: 'Other' },
];

export async function submitSafetyReport(input: {
  targetType: SafetyReportTarget;
  targetId: string | number;
  reason: string;
  description?: string;
}) {
  const targetId = Number(input.targetId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) throw new Error('This report target is unavailable.');
  const { data, error } = await supabase.rpc('submit_safety_report', {
    p_target_type: input.targetType,
    p_target_id: targetId,
    p_reason: input.reason,
    p_description: input.description?.trim() || null,
  });
  if (error) throw error;
  return data as { id: number; type: SafetyReportTarget; status: 'open' };
}

