import { supabase } from "../lib/supabase";
import { normalizeRegistrationQuestions, validateRegistrationQuestions, type RegistrationAnswer, type RegistrationQuestion, type RegistrationQuestionDraft } from "../domain/registration-questions";
import { moderatePublicContent, moderationArrayValue } from "./content-moderation";
export * from "../domain/registration-questions";
export type RegistrationForm = { questions: RegistrationQuestion[]; answers: RegistrationAnswer[]; locked: boolean };
export type ManagedRegistrationAnswer = {
  question_id: number;
  label: string;
  type: RegistrationQuestion["type"];
  value: RegistrationAnswer["value"];
};
export type ManagedRegistrationResponse = {
  participant_id: number;
  user_id: number;
  display_name: string;
  username: string;
  status: string;
  role: string;
  answers: ManagedRegistrationAnswer[];
};
function eventId(value: string | number): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid activity ID.");
  return id;
}
export const registrationQuestionService = {
  async getForm(activityId: string | number): Promise<RegistrationForm> {
    const { data, error } = await supabase.rpc("get_activity_registration_form", { p_event_id: eventId(activityId) });
    if (error) throw error;
    if (!data || !Array.isArray(data.questions) || !Array.isArray(data.answers)) throw new Error("Registration form could not load.");
    return data as RegistrationForm;
  },
  async saveQuestions(activityId: string | number, questions: RegistrationQuestionDraft[]): Promise<RegistrationQuestion[]> {
    const validation = validateRegistrationQuestions(questions);
    if (validation) throw new Error(validation);
    const normalized = normalizeRegistrationQuestions(questions);
    await moderatePublicContent({ scope: "registration_question", fields: normalized.flatMap((question) => [
      { field: "label", value: question.label }, { field: "options", value: moderationArrayValue(question.options) },
    ]) });
    const { data, error } = await supabase.rpc("save_activity_registration_questions", { p_event_id: eventId(activityId), p_questions: normalized });
    if (error) throw error;
    return data as RegistrationQuestion[];
  },
  async submit(activityId: string | number, answers: RegistrationAnswer[], status = "going"): Promise<{ status: string; [key: string]: unknown }> {
    const { data, error } = await supabase.rpc("submit_activity_registration", { p_event_id: eventId(activityId), p_answers: answers, p_status: status });
    if (error) throw error;
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || !("status" in row) || typeof row.status !== "string") throw new Error("Registration could not be saved.");
    return row as { status: string; [key: string]: unknown };
  },
  async getManagedResponses(activityId: string | number): Promise<ManagedRegistrationResponse[]> {
    const { data, error } = await supabase.rpc("get_activity_registration_responses", { p_event_id: eventId(activityId) });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Participant responses could not load.");
    return data as ManagedRegistrationResponse[];
  },
};
