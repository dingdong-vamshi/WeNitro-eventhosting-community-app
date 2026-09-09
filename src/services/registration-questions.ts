import { supabase } from "../lib/supabase";
import { normalizeRegistrationQuestions, validateRegistrationQuestions, type RegistrationAnswer, type RegistrationQuestion, type RegistrationQuestionDraft } from "../domain/registration-questions";
export * from "../domain/registration-questions";
export type RegistrationForm = { questions: RegistrationQuestion[]; answers: RegistrationAnswer[]; locked: boolean };
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
    const { data, error } = await supabase.rpc("save_activity_registration_questions", { p_event_id: eventId(activityId), p_questions: normalizeRegistrationQuestions(questions) });
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
};
