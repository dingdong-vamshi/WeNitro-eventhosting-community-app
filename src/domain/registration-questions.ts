export const questionTypes = ["short_text", "long_text", "single_choice", "multiple_choice", "checkbox"] as const;
export type RegistrationQuestionType = typeof questionTypes[number];
export type RegistrationQuestionDraft = {
  id?: number;
  label: string;
  type: RegistrationQuestionType;
  required: boolean;
  display_order: number;
  options: string[];
};
export type RegistrationQuestion = RegistrationQuestionDraft & { id: number };
export type RegistrationAnswerValue = string | string[] | boolean;
export type RegistrationAnswer = { question_id: number; value: RegistrationAnswerValue };
export const registrationLimits = { questions: 20, label: 240, options: 30, option: 160, shortText: 500, longText: 4000 } as const;

export function validateRegistrationQuestions(questions: RegistrationQuestionDraft[]): string | null {
  if (questions.length > registrationLimits.questions) return "Add no more than 20 questions.";
  const ids = new Set<number>();
  for (const [index, question] of questions.entries()) {
    const prefix = `Question ${index + 1}`;
    if (!question.label.trim() || question.label.trim().length > registrationLimits.label) return `${prefix}: enter a question of up to 240 characters.`;
    if (!questionTypes.includes(question.type)) return `${prefix}: choose a supported question type.`;
    if (question.id !== undefined) {
      if (!Number.isSafeInteger(question.id) || question.id <= 0 || ids.has(question.id)) return `${prefix}: invalid or duplicate question ID.`;
      ids.add(question.id);
    }
    if (question.type === "single_choice" || question.type === "multiple_choice") {
      const options = question.options.map(option => option.trim());
      if (options.length < 2 || options.length > registrationLimits.options || options.some(option => !option || option.length > registrationLimits.option)) return `${prefix}: enter 2–30 options, each up to 160 characters.`;
      if (new Set(options).size !== options.length) return `${prefix}: options must be unique.`;
    }
  }
  return null;
}

export function normalizeRegistrationQuestions(questions: RegistrationQuestionDraft[]): RegistrationQuestionDraft[] {
  return questions.map((question, display_order) => ({ ...question, label: question.label.trim(), display_order,
    options: question.type === "single_choice" || question.type === "multiple_choice" ? question.options.map(option => option.trim()) : [],
  }));
}

export function validateRegistrationAnswers(questions: RegistrationQuestion[], answers: RegistrationAnswer[]): string | null {
  const known = new Set(questions.map(question => question.id));
  const seen = new Set<number>();
  for (const answer of answers) {
    if (!known.has(answer.question_id) || seen.has(answer.question_id)) return "The registration form changed. Reload it and try again.";
    seen.add(answer.question_id);
  }
  for (const question of questions) {
    const value = answers.find(answer => answer.question_id === question.id)?.value;
    const missing = value === undefined || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
    if (missing) {
      if (question.required) return `Please answer: ${question.label}`;
      continue;
    }
    if (question.type === "checkbox") {
      if (typeof value !== "boolean") return `Choose an answer for: ${question.label}`;
      if (question.required && value !== true) return `Please agree to: ${question.label}`;
    } else if (question.type === "multiple_choice") {
      if (!Array.isArray(value) || value.some(option => typeof option !== "string" || !question.options.includes(option)) || new Set(value).size !== value.length) return `Choose valid options for: ${question.label}`;
    } else if (question.type === "single_choice") {
      if (typeof value !== "string" || !question.options.includes(value)) return `Choose an option for: ${question.label}`;
    } else {
      const max = question.type === "long_text" ? registrationLimits.longText : registrationLimits.shortText;
      if (typeof value !== "string" || value.length > max) return `${question.label}: use up to ${max} characters.`;
    }
  }
  return null;
}
