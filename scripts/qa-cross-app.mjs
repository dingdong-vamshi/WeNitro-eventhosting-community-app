#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_HOST = "klyjzbisgycegkkacbjw.supabase.co";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const results = [];
const secrets = [];

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[match[1]] = value;
  }
  return values;
}

function required(value, name) {
  if (!value?.trim()) throw new Error(`Missing required environment input: ${name}`);
  return value.trim();
}

function redact(value) {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("<redacted>");
  }
  return message
    .replace(/\beyJ[A-Za-z0-9._-]+\b/g, "<redacted-token>")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, "<redacted-key>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted-token>");
}

async function step(label, operation) {
  try {
    const value = await operation();
    results.push({ label, ok: true });
    console.log(`PASS ${label}`);
    return value;
  } catch (error) {
    results.push({ label, ok: false });
    console.error(`FAIL ${label}: ${redact(error)}`);
    return undefined;
  }
}

async function checked(request) {
  const response = await request;
  if (response.error) throw response.error;
  return response;
}

async function rpc(client, name, parameters = {}) {
  return (await checked(client.rpc(name, parameters))).data;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveId(value, label) {
  const record = first(value);
  const candidate =
    record && typeof record === "object"
      ? record.id ?? record.user_id ?? record.event_id ?? record.room_id
      : record;
  const id = Number(candidate);
  assert(Number.isSafeInteger(id) && id > 0, `${label} did not return a positive ID`);
  return id;
}

function requireState(value, label) {
  assert(value !== undefined && value !== null, `${label} prerequisite is unavailable`);
  return value;
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signIn(client, email, password) {
  const { data } = await checked(client.auth.signInWithPassword({ email, password }));
  assert(data.user && data.session, "Authentication did not return a session");
  return data.user;
}

async function currentAppUserId(client) {
  return positiveId(await rpc(client, "get_current_app_user_id"), "App user");
}

function objectInput(primaryName, authUserId, runId, fallbackName = "QA_MEDIA_OBJECT_PATH") {
  return required(process.env[primaryName] ?? process.env[fallbackName], primaryName)
    .replaceAll("{auth_user_id}", authUserId)
    .replaceAll("{run_id}", runId);
}

function mediaType(path) {
  return /\.(?:jpe?g|png|webp)$/i.test(path) ? "image" : "video";
}

async function assertStorageObject(client, bucket, path, authUserId) {
  assert(path.startsWith(`${authUserId}/`), `${bucket} path must begin with the QA user's Auth UUID`);
  const parts = path.split("/");
  const filename = parts.pop();
  const folder = parts.join("/");
  const { data } = await checked(
    client.storage.from(bucket).list(folder, { limit: 100, search: filename }),
  );
  assert(data?.some((item) => item.name === filename), `QA object was not found in ${bucket}`);
}

async function uploadStorageEvidence(client, bucket, path, bytes, contentType) {
  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

async function downloadStorageEvidence(client, bucket, path) {
  const { data } = await checked(client.storage.from(bucket).download(path));
  return Buffer.from(await data.arrayBuffer());
}

function qaVerificationPdf(runId) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
      `2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n` +
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n` +
      `4 0 obj\n<< /Length 72 >>\nstream\nBT /F1 12 Tf 24 90 Td ([QA] WeNitro verification ${runId}) Tj ET\nendstream\nendobj\n` +
      `trailer\n<< /Root 1 0 R >>\n%%EOF\n`,
    "ascii",
  );
}

async function main() {
  const localEnv = parseEnv(await readFile(ENV_PATH, "utf8"));
  const url = required(
    localEnv.EXPO_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL,
    "EXPO_PUBLIC_SUPABASE_URL in .env.local",
  );
  const key = required(
    localEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
  );
  const credentials = {
    member1: {
      email: required(process.env.QA_EMAIL_1, "QA_EMAIL_1"),
      password: required(process.env.QA_PASSWORD_1, "QA_PASSWORD_1"),
    },
    member2: {
      email: required(process.env.QA_EMAIL_2, "QA_EMAIL_2"),
      password: required(process.env.QA_PASSWORD_2, "QA_PASSWORD_2"),
    },
    admin: {
      email: required(process.env.QA_ADMIN_EMAIL, "QA_ADMIN_EMAIL"),
      password: required(process.env.QA_ADMIN_PASSWORD, "QA_ADMIN_PASSWORD"),
    },
  };
  secrets.push(
    key,
    credentials.member1.password,
    credentials.member2.password,
    credentials.admin.password,
  );

  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.protocol, "https:", "Supabase URL must use HTTPS");
  assert.equal(parsedUrl.hostname, EXPECTED_HOST, "Refusing to run against an unexpected Supabase project");

  const member1 = makeClient(url, key);
  const member2 = makeClient(url, key);
  const admin = makeClient(url, key);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const qa = {
    activityName: `[QA] WeNitro Badminton Activity ${runId}`,
    communityName: `[QA] WeNitro Community ${runId}`,
    vibeCaption: "[QA] WeNitro Vibe",
    storyCaption: `[QA] Cross-app story ${runId}`,
    message: `[QA] Cross-app message ${runId}`,
  };
  const state = {
    authUser1: null,
    authUser2: null,
    appUser1: null,
    appUser2: null,
    adminAppUser: null,
    activityId: null,
    communityId: null,
    communityPostId: null,
    vibeId: null,
    vibeCommentId: null,
    storyId: null,
    chatRoomId: null,
    chatMessageId: null,
    verificationId: null,
    profileOriginal: null,
    interestsOriginal: null,
    privacyOriginal: null,
  };

  await step("configuration targets the WeNitro project", async () => true);
  state.authUser1 = await step("member 1 authentication", () =>
    signIn(member1, credentials.member1.email, credentials.member1.password),
  );
  state.authUser2 = await step("member 2 authentication", () =>
    signIn(member2, credentials.member2.email, credentials.member2.password),
  );
  const adminUser = await step("admin authentication and role", async () => {
    const user = await signIn(admin, credentials.admin.email, credentials.admin.password);
    assert(
      ["admin", "super_admin"].includes(user.app_metadata?.role),
      "QA admin account lacks an admin app_metadata role",
    );
    return user;
  });

  state.appUser1 = await step("member 1 legacy-user bridge", () => currentAppUserId(member1));
  state.appUser2 = await step("member 2 legacy-user bridge", () => currentAppUserId(member2));
  state.adminAppUser = await step("admin legacy-user bridge", () => currentAppUserId(admin));

  state.profileOriginal = await step("profile read", async () => {
    const profile = first(await rpc(member1, "get_my_profile"));
    assert.equal(Number(profile?.id), requireState(state.appUser1, "member 1"));
    return profile;
  });
  await step("profile update and persistence", async () => {
    await rpc(member1, "update_my_profile", {
      p_patch: { bio: `[QA] API harness profile ${runId}` },
    });
    const profile = first(await rpc(member1, "get_my_profile"));
    assert.equal(profile?.bio, `[QA] API harness profile ${runId}`);
  });

  state.interestsOriginal = await step("interests read", async () => {
    const interests = await rpc(member1, "list_my_interests");
    assert(Array.isArray(interests), "Interest list is not an array");
    return interests.map((item) => Number(item.id));
  });
  await step("interests update and persistence", async () => {
    const catalog = await rpc(member1, "list_interest_catalog");
    assert(Array.isArray(catalog) && catalog.length > 0, "Interest catalog is empty");
    const original = requireState(state.interestsOriginal, "interests");
    const alternative = catalog.find((item) => !original.includes(Number(item.id)));
    const selected = alternative ? [Number(alternative.id)] : original.length ? [] : [Number(catalog[0].id)];
    await rpc(member1, "set_my_interests", { p_category_ids: selected });
    const persisted = await rpc(member1, "list_my_interests");
    assert.deepEqual(
      persisted.map((item) => Number(item.id)).sort((a, b) => a - b),
      [...selected].sort((a, b) => a - b),
    );
  });

  state.privacyOriginal = await step("privacy read", async () => {
    const settings = first(await rpc(member1, "get_user_privacy_settings"));
    assert(settings?.user_id, "Privacy settings were not returned");
    return settings;
  });
  await step("privacy update and persistence", async () => {
    const original = requireState(state.privacyOriginal, "privacy");
    const toggled = !Boolean(original.show_online_status);
    await rpc(member1, "update_user_privacy_settings", {
      p_profile_visibility: null,
      p_email_visibility: null,
      p_phone_visibility: null,
      p_message_visibility: null,
      p_show_online_status: toggled,
    });
    const persisted = first(await rpc(member1, "get_user_privacy_settings"));
    assert.equal(Boolean(persisted?.show_online_status), toggled);
  });

  state.activityId = await step("activity create RPC and database persistence", async () => {
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const registrationClose = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const id = positiveId(
      await rpc(member1, "create_activity", {
        p_payload: {
          title: qa.activityName,
          description: "Harmless repeatable cross-app QA activity",
          category: "[QA] Automation",
          event_start_time: start.toISOString(),
          event_end_time: end.toISOString(),
          registration_close_time: registrationClose.toISOString(),
          max_participants: 4,
          visibility_type: "public",
          join_type: "direct",
          location: "QA Test Location",
          display_location: "QA Test Location",
          is_paid: false,
          price_inr: 0,
          activity_type: "sport",
        },
        p_status: "published",
      }),
      "Activity",
    );
    const { data } = await checked(
      member1.from("tbl_events").select("id,title,status,is_cancelled").eq("id", id).single(),
    );
    assert.equal(data.title, qa.activityName);
    return id;
  });

  await step("activity join RPC", async () => {
    const participant = first(
      await rpc(member2, "request_join_activity", {
        p_event_id: requireState(state.activityId, "activity"),
        p_status: "going",
      }),
    );
    assert.equal(Number(participant?.user_id), requireState(state.appUser2, "member 2"));
    assert(["pending", "approved"].includes(participant?.status));
  });
  await step("activity approve RPC", async () => {
    const participant = first(
      await rpc(member1, "respond_activity_join", {
        p_event_id: requireState(state.activityId, "activity"),
        p_user_id: requireState(state.appUser2, "member 2"),
        p_status: "approved",
      }),
    );
    assert.equal(participant?.status, "approved");
  });

  state.communityId = await step("community create RPC", async () =>
    positiveId(
      await rpc(member1, "community_create", {
        p_name: qa.communityName,
        p_tagline: "Cross-app QA",
        p_description: "Harmless repeatable community QA",
        p_category: "[QA] Automation",
        p_tags: ["qa", "automation"],
        p_rules: ["QA data only"],
        p_image_path: "",
        p_cover_path: "",
        p_visibility: "public",
      }),
      "Community",
    ),
  );
  await step("community join RPC", async () => {
    const membership = first(
      await rpc(member2, "community_join", {
        p_room_id: requireState(state.communityId, "community"),
      }),
    );
    assert.equal(membership?.status, "active");
  });
  state.communityPostId = await step("community post RPC", async () =>
    positiveId(
      await rpc(member2, "community_create_post", {
        p_room_id: requireState(state.communityId, "community"),
        p_title: `[QA] Community post ${runId}`,
        p_body: "Harmless cross-app QA post",
        p_category: "General",
        p_media_path: null,
        p_media_type: null,
      }),
      "Community post",
    ),
  );
  await step("community reaction RPC", async () => {
    await rpc(member1, "community_set_post_reaction", {
      p_post_id: requireState(state.communityPostId, "community post"),
      p_reaction: "like",
    });
    const { data } = await checked(
      member1
        .from("tbl_community_post_reactions")
        .select("post_id,reaction")
        .eq("post_id", state.communityPostId)
        .eq("user_id", state.appUser1)
        .single(),
    );
    assert.equal(data.reaction, "like");
  });
  await step("community comment RPC and listing", async () => {
    const comment = first(
      await rpc(member1, "community_create_post_comment", {
        p_post_id: requireState(state.communityPostId, "community post"),
        p_body: `[QA] Community comment ${runId}`,
        p_parent_id: null,
      }),
    );
    assert(comment?.id, "Community comment ID is missing");
    const page = first(
      await rpc(member1, "community_list_post_comments", {
        p_post_id: state.communityPostId,
        p_page: 1,
        p_page_size: 20,
      }),
    );
    assert(page?.items?.some((item) => Number(item.id) === Number(comment.id)));
  });

  const vibePath = objectInput(
    "QA_VIBE_OBJECT_PATH",
    requireState(state.authUser1, "member 1 auth").id,
    runId,
  );
  await step("vibe QA video upload and Storage verification", async () => {
    assert.equal(mediaType(vibePath), "video", "QA Vibe must use a video object path");
    const source = await readFile(
      resolve(ROOT, process.env.QA_VIBE_FILE_PATH ?? "test-assets/wenitro-qa-vibe.mp4"),
    );
    assert.equal(source.subarray(4, 8).toString("ascii"), "ftyp", "QA Vibe source is not MP4 video");
    await uploadStorageEvidence(member1, "vibes", vibePath, source, "video/mp4");
    await assertStorageObject(
      member1,
      "vibes",
      vibePath,
      requireState(state.authUser1, "member 1 auth").id,
    );
    const persisted = await downloadStorageEvidence(member1, "vibes", vibePath);
    assert.equal(persisted.subarray(4, 8).toString("ascii"), "ftyp", "Stored QA Vibe is not MP4 video");
  });
  state.vibeId = await step("vibe create RPC and database persistence", async () => {
    const vibe = first(
      await rpc(member1, "vibe_create", {
        p_event_id: state.activityId,
        p_media_path: vibePath,
        p_media_type: "video",
        p_caption: qa.vibeCaption,
        p_hashtags: ["qa", "wenitro"],
        p_visibility: "public",
      }),
    );
    const id = positiveId(vibe, "Vibe");
    const { data } = await checked(
      member1.from("tbl_activity_vibes").select("id,caption,media_url").eq("id", id).single(),
    );
    assert.equal(data.caption, qa.vibeCaption);
    assert.equal(data.media_url, vibePath);
    return id;
  });
  await step("vibe like RPC", async () => {
    await rpc(member2, "vibe_set_liked", {
      p_vibe_id: requireState(state.vibeId, "vibe"),
      p_liked: true,
    });
    const { data } = await checked(
      member2
        .from("tbl_vibe_likes")
        .select("vibe_id,user_id")
        .eq("vibe_id", state.vibeId)
        .eq("user_id", state.appUser2)
        .single(),
    );
    assert.equal(Number(data.user_id), state.appUser2);
  });
  state.vibeCommentId = await step("vibe comment RPC", async () =>
    positiveId(
      await rpc(member2, "vibe_create_comment", {
        p_vibe_id: requireState(state.vibeId, "vibe"),
        p_body: `[QA] Vibe comment ${runId}`,
        p_parent_id: null,
      }),
      "Vibe comment",
    ),
  );

  const storyPath = objectInput(
    "QA_STORY_OBJECT_PATH",
    requireState(state.authUser1, "member 1 auth").id,
    runId,
  );
  await step("story QA video upload and Storage verification", async () => {
    const source = await readFile(
      resolve(ROOT, process.env.QA_STORY_FILE_PATH ?? "test-assets/wenitro-qa-vibe.mp4"),
    );
    await uploadStorageEvidence(member1, "stories", storyPath, source, "video/mp4");
    await assertStorageObject(
      member1,
      "stories",
      storyPath,
      requireState(state.authUser1, "member 1 auth").id,
    );
    const persisted = await downloadStorageEvidence(member1, "stories", storyPath);
    assert.equal(persisted.subarray(4, 8).toString("ascii"), "ftyp", "Stored QA Story is not MP4 video");
  });
  state.storyId = await step("story create RPC and database persistence", async () => {
    const story = first(
      await rpc(member1, "create_story", {
        p_media_url: storyPath,
        p_media_type: mediaType(storyPath),
        p_caption: qa.storyCaption,
        p_expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
      }),
    );
    const id = positiveId(story, "Story");
    const active = await rpc(member2, "list_active_stories", {
      p_limit: 100,
      p_before_created_at: null,
      p_before_id: null,
    });
    assert(active.some((item) => Number(item.id) === id), "Story is absent from the active feed");
    return id;
  });
  await step("story view RPC and viewed persistence", async () => {
    await rpc(member2, "mark_story_viewed", {
      p_story_id: requireState(state.storyId, "story"),
    });
    const active = await rpc(member2, "list_active_stories", {
      p_limit: 100,
      p_before_created_at: null,
      p_before_id: null,
    });
    const story = active.find((item) => Number(item.id) === state.storyId);
    assert.equal(story?.viewed, true);
  });

  state.chatRoomId = await step("chat room RPC", async () =>
    positiveId(
      await rpc(member1, "create_direct_chat_room", {
        p_other_user_id: requireState(state.appUser2, "member 2"),
      }),
      "Chat room",
    ),
  );
  state.chatMessageId = await step("chat send and recipient read RPC", async () => {
    const clientId = randomUUID();
    const message = first(
      await rpc(member1, "send_chat_message", {
        p_room_id: requireState(state.chatRoomId, "chat room"),
        p_client_id: clientId,
        p_content: qa.message,
        p_message_type: "text",
        p_media_url: null,
      }),
    );
    const id = positiveId(message, "Chat message");
    const messages = await rpc(member2, "list_chat_messages", {
      p_room_id: state.chatRoomId,
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 51,
      p_include_deleted: false,
    });
    assert(messages.some((item) => Number(item.id) === id && item.content === qa.message));
    await rpc(member2, "mark_chat_read", {
      p_room_id: state.chatRoomId,
      p_read_at: new Date().toISOString(),
    });
    const reread = await rpc(member2, "list_chat_messages", {
      p_room_id: state.chatRoomId,
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 51,
      p_include_deleted: false,
    });
    assert.equal(reread.find((item) => Number(item.id) === id)?.is_read, true);
    return id;
  });

  await step("notification list, trigger correlation, and mark-read RPC", async () => {
    const notifications = await rpc(member2, "list_user_notifications", {
      p_limit: 101,
      p_before_id: null,
    });
    const notification = notifications.find(
      (item) =>
        item.type === "message" &&
        (String(item.reference_id) === String(state.chatMessageId) ||
          Number(item.data?.message_id) === state.chatMessageId),
    );
    assert(notification?.id, "Message notification was not generated");
    await rpc(member2, "mark_notification_read", {
      p_notification_id: Number(notification.id),
    });
    const persisted = await rpc(member2, "list_user_notifications", {
      p_limit: 101,
      p_before_id: null,
    });
    assert.equal(
      persisted.find((item) => Number(item.id) === Number(notification.id))?.is_read,
      true,
    );
  });

  state.verificationId = await step("verification draft RPC and user listing", async () => {
    const draft = first(
      await rpc(member1, "create_verification_draft", {
        p_verification_type: "identity",
      }),
    );
    const id = positiveId(draft, "Verification draft");
    const mine = await rpc(member1, "list_user_verifications");
    assert(mine.some((item) => Number(item.id) === id && item.status === "draft"));
    return id;
  });

  const verificationPath = objectInput(
    "QA_VERIFICATION_OBJECT_PATH",
    requireState(state.authUser1, "member 1 auth").id,
    runId,
  );
  const verificationPdf = qaVerificationPdf(runId);
  await step("verification document upload and private Storage verification", async () => {
    assert(/\.pdf$/i.test(verificationPath), "QA verification object path must end in .pdf");
    await uploadStorageEvidence(
      member1,
      "verification",
      verificationPath,
      verificationPdf,
      "application/pdf",
    );
    await assertStorageObject(
      member1,
      "verification",
      verificationPath,
      requireState(state.authUser1, "member 1 auth").id,
    );
    const persisted = await downloadStorageEvidence(member1, "verification", verificationPath);
    assert.equal(persisted.subarray(0, 5).toString("ascii"), "%PDF-", "Stored verification evidence is not a PDF");
  });
  await step("verification finalize and submitted user status", async () => {
    const submission = first(
      await rpc(member1, "finalize_verification", {
        p_verification_id: requireState(state.verificationId, "verification"),
        p_document_path: verificationPath,
        p_document_mime: "application/pdf",
        p_document_size: verificationPdf.length,
      }),
    );
    assert.equal(submission?.status, "submitted");
    assert.equal(submission?.document_path, verificationPath);
    const mine = await rpc(member1, "list_user_verifications");
    const persisted = mine.find((item) => Number(item.id) === state.verificationId);
    assert.equal(persisted?.status, "submitted");
    assert.equal(persisted?.document_path, verificationPath);
  });
  await step("admin sees exact submitted verification", async () => {
    const submissions = await rpc(admin, "admin_list_verifications", {
      p_status: "submitted",
      p_limit: 100,
      p_before_id: null,
    });
    const submission = submissions.find((item) => Number(item.id) === state.verificationId);
    assert.equal(Number(submission?.user_id), state.appUser1);
    assert.equal(submission?.document_path, verificationPath);
  });
  await step("admin approves verification through review RPC", async () => {
    const reviewed = first(
      await rpc(admin, "admin_review_verification", {
        p_verification_id: requireState(state.verificationId, "verification"),
        p_status: "approved",
        p_review_notes: `[QA] Approved by cross-app harness ${runId}`,
      }),
    );
    assert.equal(reviewed?.status, "approved");
    assert.equal(Number(reviewed?.user_id), state.appUser1);
  });
  await step("mobile user reflects approval and verified badge award", async () => {
    const [mine, profile, badges] = await Promise.all([
      rpc(member1, "list_user_verifications"),
      rpc(member1, "get_my_profile"),
      rpc(member1, "list_my_badges"),
    ]);
    assert.equal(
      mine.find((item) => Number(item.id) === state.verificationId)?.status,
      "approved",
    );
    assert.equal(Number(first(profile)?.isverified), 1);
    const verifiedBadge = badges.find((badge) => badge.slug === "verified");
    assert(verifiedBadge, "Verified badge was not awarded");
    assert.equal(Number(verifiedBadge.awarded_by), state.adminAppUser);
  });

  await step("admin live legacy-table reads", async () => {
    requireState(adminUser, "admin auth");
    const [users, activity, participant, community, post, vibe, story, verification] =
      await Promise.all([
        checked(admin.from("tbl_users").select("id", { count: "exact", head: true })),
        checked(admin.from("tbl_events").select("id,title").eq("id", state.activityId).single()),
        checked(
          admin
            .from("tbl_event_participants")
            .select("event_id,user_id,status")
            .eq("event_id", state.activityId)
            .eq("user_id", state.appUser2)
            .single(),
        ),
        checked(admin.from("tbl_chat_rooms").select("id,title").eq("id", state.communityId).single()),
        checked(admin.from("tbl_community_posts").select("id,room_id").eq("id", state.communityPostId).single()),
        checked(admin.from("tbl_activity_vibes").select("id,caption").eq("id", state.vibeId).single()),
        checked(admin.from("tbl_stories").select("id,caption").eq("id", state.storyId).single()),
        checked(admin.rpc("admin_list_verifications", {
          p_status: "approved",
          p_limit: 100,
          p_before_id: null,
        })),
      ]);
    assert((users.count ?? 0) > 0, "Admin user count is empty");
    assert.equal(Number(activity.data.id), state.activityId);
    assert.equal(activity.data.title, qa.activityName);
    assert.equal(Number(participant.data.user_id), state.appUser2);
    assert.equal(Number(community.data.id), state.communityId);
    assert.equal(community.data.title, qa.communityName);
    assert.equal(Number(post.data.room_id), state.communityId);
    assert.equal(vibe.data.caption, qa.vibeCaption);
    assert.equal(story.data.caption, qa.storyCaption);
    assert(
      verification.data.some((item) => Number(item.id) === state.verificationId),
      "Admin cannot see the approved verification",
    );
  });
  await step("profile state restoration", async () => {
    const original = requireState(state.profileOriginal, "profile");
    await rpc(member1, "update_my_profile", { p_patch: { bio: original.bio ?? null } });
  });
  await step("interest state restoration", async () => {
    await rpc(member1, "set_my_interests", {
      p_category_ids: requireState(state.interestsOriginal, "interests"),
    });
  });
  await step("privacy state restoration", async () => {
    const original = requireState(state.privacyOriginal, "privacy");
    await rpc(member1, "update_user_privacy_settings", {
      p_profile_visibility: original.profile_visibility,
      p_email_visibility: original.email_visibility,
      p_phone_visibility: original.phone_visibility,
      p_message_visibility: original.message_visibility,
      p_show_online_status: original.show_online_status,
    });
  });
  await step("session cleanup", async () => {
    const outcomes = await Promise.all([
      member1.auth.signOut(),
      member2.auth.signOut(),
      admin.auth.signOut(),
    ]);
    for (const outcome of outcomes) if (outcome.error) throw outcome.error;
  });

  const failed = results.filter((result) => !result.ok);
  console.log(`SUMMARY ${results.length - failed.length}/${results.length} operations passed`);
  console.log(
    `QA RECORDS activity=${state.activityId ?? "none"} community=${state.communityId ?? "none"} post=${state.communityPostId ?? "none"} vibe=${state.vibeId ?? "none"} story=${state.storyId ?? "none"} verification=${state.verificationId ?? "none"} chat_room=${state.chatRoomId ?? "none"} chat_message=${state.chatMessageId ?? "none"}`,
  );
  if (failed.length) {
    console.error(`FAILED OPERATIONS ${failed.map((result) => result.label).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL harness initialization: ${redact(error)}`);
  process.exitCode = 1;
});
