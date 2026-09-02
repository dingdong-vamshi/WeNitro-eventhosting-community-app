import { supabase } from "../lib/supabase";

export type VerificationRequest = {
  id: string;
  verification_type: "identity" | "phone" | "email" | "social";
  status: "draft" | "submitted" | "reviewing" | "approved" | "rejected";
  document_path: string | null;
  review_notes: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
};

async function userId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication is required.");
  return data.user.id;
}

async function readMedia(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected document.");
  return response.arrayBuffer();
}

export const verificationService = {
  async list(): Promise<VerificationRequest[]> {
    const { data, error } = await supabase
      .from("verification_requests")
      .select("id,verification_type,status,document_path,review_notes,submitted_at,reviewed_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as VerificationRequest[];
  },

  async submitIdentity(uri: string, contentType = "image/jpeg") {
    const id = await userId();
    const extension = contentType === "application/pdf" ? "pdf" : contentType.includes("png") ? "png" : "jpg";
    const path = `${id}/${crypto.randomUUID()}.${extension}`;
    const body = await readMedia(uri);
    const upload = await supabase.storage
      .from("verification-documents")
      .upload(path, body, { contentType, upsert: false });
    if (upload.error) throw upload.error;
    const { data, error } = await supabase
      .from("verification_requests")
      .insert({
        user_id: id,
        verification_type: "identity",
        status: "submitted",
        document_path: path,
        submitted_at: new Date().toISOString(),
        submitted_data: { consent: true, source: "wenitro_app" },
      })
      .select("id,verification_type,status,document_path,review_notes,submitted_at,reviewed_at,created_at")
      .single();
    if (error) {
      await supabase.storage.from("verification-documents").remove([path]);
      throw error;
    }
    return data as VerificationRequest;
  },
};
