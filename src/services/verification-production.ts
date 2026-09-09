import { supabase } from "../lib/supabase";

export type VerificationStatus =
  | "draft"
  | "submitted"
  | "reviewing"
  | "approved"
  | "rejected";
export type VerificationRequest = {
  id: number;
  user_id: number;
  verification_type: "identity";
  status: VerificationStatus;
  document_path: string | null;
  review_notes: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  phone_verified: boolean;
  aadhaar_verified: boolean;
};
export type VerificationDocument = {
  path: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  size: number;
};
export const verificationBridgeRpc = {
  list: "list_user_verifications",
  createDraft: "create_verification_draft",
  finalize: "finalize_verification",
  discardDraft: "discard_verification_draft",
} as const;

const BUCKET = "verification";
const MAX_BYTES = 10 * 1024 * 1024;
type Mime = VerificationDocument["contentType"];
type Row = Record<string, unknown>;
const allowed = new Set<Mime>(["image/jpeg", "image/png", "application/pdf"]);
const record = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const first = (value: unknown) =>
  record(Array.isArray(value) ? value[0] : value);
function id(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Invalid ${field}.`);
  return parsed;
}
function mapVerification(value: unknown): VerificationRequest {
  const row = record(value);
  return {
    id: id(row.id, "verification id"),
    user_id: id(row.user_id, "verification user id"),
    verification_type: "identity",
    status: String(row.status ?? "draft") as VerificationStatus,
    document_path:
      typeof row.document_path === "string" ? row.document_path : null,
    review_notes: String(row.review_notes ?? ""),
    submitted_at:
      typeof row.submitted_at === "string" ? row.submitted_at : null,
    reviewed_at:
      typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    phone_verified: Boolean(row.phone_verified),
    aadhaar_verified: Boolean(row.aadhaar_verified),
  };
}
async function authUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authentication is required.");
  return data.user.id;
}
function detectedMime(bytes: Uint8Array): Mime | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
    return "application/pdf";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  return null;
}
async function readDocument(uri: string, requested?: string) {
  if (!uri.trim()) throw new Error("Document URI is required.");
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected document.");
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BYTES)
    throw new Error("Verification documents must be 10 MB or smaller.");
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error("The selected document is empty.");
  if (body.byteLength > MAX_BYTES)
    throw new Error("Verification documents must be 10 MB or smaller.");
  const contentType = detectedMime(new Uint8Array(body));
  if (!contentType)
    throw new Error("Use a JPEG, PNG, or PDF verification document.");
  const normalized = requested
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  if (
    normalized &&
    (!allowed.has(normalized as Mime) || normalized !== contentType)
  )
    throw new Error("The document contents do not match its MIME type.");
  return { body, contentType };
}
const extension = (mime: Mime) =>
  mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
async function discard(draftId: number) {
  const { error } = await supabase.rpc(verificationBridgeRpc.discardDraft, {
    p_verification_id: draftId,
  });
  if (error) throw error;
}

export const verificationService = {
  async list(): Promise<VerificationRequest[]> {
    await authUserId();
    const { data, error } = await supabase.rpc(verificationBridgeRpc.list);
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapVerification);
  },

  async createDraft(): Promise<VerificationRequest> {
    await authUserId();
    const { data, error } = await supabase.rpc(
      verificationBridgeRpc.createDraft,
      { p_verification_type: "identity" },
    );
    if (error) throw error;
    return mapVerification(first(data));
  },

  async uploadDraftDocument(
    draftId: number,
    uri: string,
    requestedMime?: string,
  ): Promise<VerificationDocument> {
    id(draftId, "verification id");
    const authId = await authUserId();
    const document = await readDocument(uri, requestedMime);
    const path = `${authId}/${draftId}/${crypto.randomUUID()}.${extension(
      document.contentType,
    )}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, document.body, {
        contentType: document.contentType,
        cacheControl: "0",
        upsert: false,
      });
    if (error) throw error;
    return {
      path,
      contentType: document.contentType,
      size: document.body.byteLength,
    };
  },

  async finalizeDraft(
    draftId: number,
    document: VerificationDocument,
  ): Promise<VerificationRequest> {
    id(draftId, "verification id");
    await authUserId();
    if (!allowed.has(document.contentType))
      throw new Error("Unsupported document MIME type.");
    if (
      !Number.isSafeInteger(document.size) ||
      document.size <= 0 ||
      document.size > MAX_BYTES
    )
      throw new Error("Invalid verification document size.");
    const { data, error } = await supabase.rpc(
      verificationBridgeRpc.finalize,
      {
        p_verification_id: draftId,
        p_document_path: document.path,
        p_document_mime: document.contentType,
        p_document_size: document.size,
      },
    );
    if (error) throw error;
    return mapVerification(first(data));
  },

  async discardDraft(draftId: number): Promise<void> {
    id(draftId, "verification id");
    await authUserId();
    await discard(draftId);
  },

  async submitIdentity(
    uri: string,
    contentType?: string,
  ): Promise<VerificationRequest> {
    const draft = await this.createDraft();
    let document: VerificationDocument | null = null;
    try {
      document = await this.uploadDraftDocument(
        draft.id,
        uri,
        contentType,
      );
      return await this.finalizeDraft(draft.id, document);
    } catch (error) {
      await Promise.allSettled([
        document
          ? supabase.storage.from(BUCKET).remove([document.path])
          : Promise.resolve(),
        discard(draft.id),
      ]);
      throw error;
    }
  },
};
