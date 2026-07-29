import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };
const BUCKET = "documentos";
const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemini-3.6-flash";
const ALLOWED_MANAGER_ROLES = new Set(["admin", "gestor", "secretario", "superadmin"]);
const CURRENT_TERMS_VERSION = "2026-07-29";

type Json = Record<string, unknown>;
type InviteRow = {
  id: string;
  tenant_id: string;
  department_id: string | null;
  expires_at: string;
  max_uses: number;
  use_count: number;
  ai_use_count: number;
  status: string;
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function response(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function digits(value: unknown) {
  return cleanText(value).replace(/\D/g, "");
}

function normalizeEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

function validCpf(raw: string) {
  if (!/^\d{11}$/.test(raw) || /^(\d)\1{10}$/.test(raw)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(raw[i]) * (length + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return calc(9) === Number(raw[9]) && calc(10) === Number(raw[10]);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function randomToken(bytes = 32) {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getInvite(rawToken: unknown): Promise<InviteRow | null> {
  const token = cleanText(rawToken, 256);
  if (token.length < 32) return null;
  const { data } = await admin()
    .from("driver_registration_invites")
    .select("id, tenant_id, department_id, expires_at, max_uses, use_count, ai_use_count, status")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  const invite = data as InviteRow | null;
  if (
    !invite ||
    invite.status !== "active" ||
    invite.use_count >= invite.max_uses ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) return null;
  return invite;
}

async function managerContext(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const sb = admin();
  const { data: authData } = await sb.auth.getUser(token);
  if (!authData.user) return null;
  const { data } = await sb
    .from("profiles")
    .select("id, tenant_id, department_id, role")
    .eq("id", authData.user.id)
    .maybeSingle();
  const profile = data as { id: string; tenant_id: string; department_id: string | null; role: string } | null;
  return profile && ALLOWED_MANAGER_ROLES.has(profile.role) ? profile : null;
}

async function invitePresentation(invite: InviteRow) {
  const sb = admin();
  const [{ data: tenant }, { data: departments }] = await Promise.all([
    sb.from("tenants")
      .select("id, name, app_name, login_eyebrow, logo_url, seal_url, primary_color")
      .eq("id", invite.tenant_id)
      .single(),
    sb.from("departments")
      .select("id, name")
      .eq("tenant_id", invite.tenant_id)
      .order("name"),
  ]);
  const scopedDepartments = invite.department_id
    ? (departments ?? []).filter((department: { id: string }) => department.id === invite.department_id)
    : (departments ?? []);
  return {
    tenant,
    departments: scopedDepartments,
    expiresAt: invite.expires_at,
  };
}

async function createInvite(req: Request, body: Json) {
  const manager = await managerContext(req);
  if (!manager) return response({ error: "Acesso de gestor necessário." }, 401);

  let departmentId = cleanText(body.departmentId, 50) || null;
  if (manager.role === "secretario") departmentId = manager.department_id;
  if (departmentId) {
    const { data: department } = await admin()
      .from("departments").select("id").eq("id", departmentId)
      .eq("tenant_id", manager.tenant_id).maybeSingle();
    if (!department) return response({ error: "Secretaria inválida." }, 400);
  }

  const expiresInDays = Math.min(30, Math.max(1, Number(body.expiresInDays) || 7));
  const maxUses = Math.min(100, Math.max(1, Number(body.maxUses) || 1));
  const token = randomToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
  const { data, error } = await admin().from("driver_registration_invites").insert({
    tenant_id: manager.tenant_id,
    department_id: departmentId,
    token_hash: await sha256(token),
    created_by: manager.id,
    expires_at: expiresAt,
    max_uses: maxUses,
  }).select("id").single();
  if (error) return response({ error: error.message }, 400);
  // `inviteUrl` é a entrada principal: o motorista realiza todo o cadastro
  // diretamente no navegador, sem depender do aplicativo instalado.
  const webBase = (Deno.env.get("PUBLIC_WEB_URL") ?? "https://exattusrotta.com.br")
    .replace(/\/$/, "");
  return response({
    data: {
      id: data.id,
      token,
      inviteUrl: `${webBase}/convite?token=${token}`,
      expiresAt,
      maxUses,
    },
  });
}

async function validateInvite(body: Json) {
  const invite = await getInvite(body.token);
  if (!invite) return response({ error: "Convite inválido, expirado ou já utilizado." }, 404);
  return response({ data: await invitePresentation(invite) });
}

async function checkCpf(body: Json) {
  const invite = await getInvite(body.token);
  if (!invite) return response({ error: "Convite inválido, expirado ou já utilizado." }, 404);
  const cpf = digits(body.cpf);
  if (!validCpf(cpf)) {
    return response({ data: { valid: false, available: false } });
  }
  const { data, error } = await admin()
    .from("profiles")
    .select("id")
    .eq("tenant_id", invite.tenant_id)
    .eq("cpf", cpf)
    .limit(1)
    .maybeSingle();
  if (error) return response({ error: "Não foi possível verificar o CPF agora." }, 500);
  return response({ data: { valid: true, available: !data } });
}

async function createUpload(body: Json) {
  const invite = await getInvite(body.token);
  if (!invite) return response({ error: "Convite inválido, expirado ou já utilizado." }, 404);
  const side = cleanText(body.side, 10) === "back" ? "back" : "front";
  const path = `driver-registration/${invite.id}/${randomToken(16)}-${side}.jpg`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return response({ error: error?.message ?? "Não foi possível preparar o envio." }, 400);
  return response({ data: { path, token: data.token } });
}

const SYSTEM_PROMPT = `Você lê CNH brasileira a partir de fotos. Retorne APENAS JSON válido:
{"name":string|null,"cpf":string|null,"birthDate":string|null,"cnhNumber":string|null,"cnhCategory":string|null,"cnhExpiry":string|null,"confidence":number}
Datas devem estar em YYYY-MM-DD, CPF e número da CNH apenas com dígitos. confidence deve ficar entre 0 e 1.`;

async function extractCnh(body: Json) {
  const invite = await getInvite(body.token);
  if (!invite) return response({ error: "Convite inválido, expirado ou já utilizado." }, 404);
  if (invite.ai_use_count >= invite.max_uses * 5) {
    return response({ error: "Limite de leituras automáticas atingido para este convite. Preencha os dados manualmente." }, 429);
  }
  const paths = Array.isArray(body.paths)
    ? body.paths.map((path) => cleanText(path, 500)).filter(Boolean).slice(0, 2)
    : [];
  const prefix = `driver-registration/${invite.id}/`;
  if (!paths.length || paths.some((path) => !path.startsWith(prefix))) {
    return response({ error: "Arquivos da CNH inválidos." }, 400);
  }
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return response({ error: "Leitura automática indisponível. Preencha os dados manualmente." }, 503);

  const signed = await Promise.all(paths.map(async (path) => {
    const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) throw new Error("Não foi possível ler a foto da CNH.");
    return data.signedUrl;
  }));

  await admin().from("driver_registration_invites")
    .update({ ai_use_count: invite.ai_use_count + 1 })
    .eq("id", invite.id).eq("ai_use_count", invite.ai_use_count);

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sgf-2026.local",
      "X-Title": "Exattus Rotta - Pré-cadastro CNH",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia os dados da CNH. Se algo não estiver legível, use null." },
            ...signed.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });
  if (!aiRes.ok) return response({ error: "A leitura automática falhou. Revise os dados manualmente." }, 502);
  const aiJson = await aiRes.json();
  const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
  try {
    return response({ data: JSON.parse(raw) });
  } catch {
    return response({ error: "A leitura retornou dados inválidos. Preencha manualmente." }, 502);
  }
}

async function submitRegistration(body: Json) {
  const invite = await getInvite(body.token);
  if (!invite) return response({ error: "Convite inválido, expirado ou já utilizado." }, 404);

  const fullName = cleanText(body.fullName);
  const cpf = digits(body.cpf);
  const birthDate = cleanText(body.birthDate, 10);
  const cnhNumber = digits(body.cnhNumber);
  const cnhCategory = cleanText(body.cnhCategory, 5).toUpperCase();
  const cnhExpiry = cleanText(body.cnhExpiry, 10);
  const email = normalizeEmail(body.email);
  const confirmEmail = normalizeEmail(body.confirmEmail);
  const phone = digits(body.phone).slice(0, 13);
  const password = cleanText(body.password, 128);
  const departmentId = invite.department_id ?? cleanText(body.departmentId, 50);
  const manualEntry = body.manualEntry === true;
  const acceptedTerms = body.acceptedTerms === true;
  const frontPath = cleanText(body.cnhFrontPath, 500) || null;
  const backPath = cleanText(body.cnhBackPath, 500) || null;
  const storagePrefix = `driver-registration/${invite.id}/`;

  if (fullName.length < 5) return response({ error: "Informe o nome completo." }, 400);
  if (!validCpf(cpf)) return response({ error: "CPF inválido." }, 400);
  if (cnhNumber.length < 9) return response({ error: "Número da CNH inválido." }, 400);
  if (!cnhCategory) return response({ error: "Informe a categoria da CNH." }, 400);
  if (!validDate(cnhExpiry)) return response({ error: "Validade da CNH inválida." }, 400);
  if (birthDate && !validDate(birthDate)) return response({ error: "Data de nascimento inválida." }, 400);
  if (!email.includes("@") || email !== confirmEmail) return response({ error: "Os e-mails informados não coincidem." }, 400);
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return response({ error: "A senha deve ter ao menos 8 caracteres, com maiúscula, minúscula e número." }, 400);
  }
  if (!acceptedTerms) {
    return response({ error: "É necessário aceitar os Termos de Uso e o tratamento de dados conforme a LGPD." }, 400);
  }
  if (manualEntry) {
    if (frontPath || backPath) return response({ error: "O preenchimento manual não deve incluir arquivos da CNH." }, 400);
  } else {
    if (!frontPath?.startsWith(storagePrefix) || (backPath && !backPath.startsWith(storagePrefix))) {
      return response({ error: "Envie uma foto válida da CNH." }, 400);
    }
    const frontName = frontPath.slice(storagePrefix.length);
    const { data: uploadedFiles } = await admin().storage.from(BUCKET)
      .list(storagePrefix.replace(/\/$/, ""), { search: frontName, limit: 2 });
    if (!uploadedFiles?.some((file) => file.name === frontName)) {
      return response({ error: "A foto da CNH não foi encontrada. Fotografe o documento novamente." }, 400);
    }
  }
  const { data: department } = await admin().from("departments").select("id, name")
    .eq("id", departmentId).eq("tenant_id", invite.tenant_id).maybeSingle();
  if (!department) return response({ error: "Selecione uma secretaria válida." }, 400);

  const sb = admin();
  const { data: existing } = await sb.from("profiles").select("id")
    .eq("tenant_id", invite.tenant_id).eq("cpf", cpf).maybeSingle();
  if (existing) return response({ error: "Já existe um cadastro com este CPF." }, 409);

  const authEmail = `driver-${cpf}@internal.sgf2026.local`;
  const { data: created, error: createError } = await sb.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: {
      full_name: fullName,
      tenant_id: invite.tenant_id,
      role: "motorista",
      registration_source: "self_registration",
    },
  });
  if (createError || !created.user) {
    const message = /already|registered|exists/i.test(createError?.message ?? "")
      ? "Já existe um acesso associado a este CPF."
      : (createError?.message ?? "Não foi possível criar o acesso.");
    return response({ error: message }, 409);
  }

  const userId = created.user.id;
  const trackingToken = randomToken();
  try {
    const { error: profileError } = await sb.from("profiles").update({
      full_name: fullName,
      cpf,
      birth_date: birthDate || null,
      cnh_number: cnhNumber,
      cnh_category: cnhCategory,
      cnh_expiry: cnhExpiry,
      email,
      phone: phone || null,
      department_id: departmentId,
      department: department.name,
      role: "motorista",
      driver_status: "inativo",
      registration_status: "pending",
      access_blocked: true,
      must_change_password: false,
    }).eq("id", userId);
    if (profileError) throw profileError;

    const { data: request, error: requestError } = await sb.from("driver_registration_requests").insert({
      tenant_id: invite.tenant_id,
      invite_id: invite.id,
      auth_user_id: userId,
      department_id: departmentId,
      tracking_token_hash: await sha256(trackingToken),
      full_name: fullName,
      cpf,
      birth_date: birthDate || null,
      cnh_number: cnhNumber,
      cnh_category: cnhCategory,
      cnh_expiry: cnhExpiry,
      email,
      phone: phone || null,
      cnh_front_path: frontPath,
      cnh_back_path: backPath,
      document_entry_mode: manualEntry ? "manual" : "photo",
      ai_confidence: typeof body.aiConfidence === "number" ? body.aiConfidence : null,
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
      terms_version: cleanText(body.termsVersion, 30) || CURRENT_TERMS_VERSION,
    }).select("id").single();
    if (requestError) throw requestError;

    const nextUseCount = invite.use_count + 1;
    const { data: consumed } = await sb.from("driver_registration_invites").update({
      use_count: nextUseCount,
      status: nextUseCount >= invite.max_uses ? "exhausted" : "active",
    }).eq("id", invite.id).eq("use_count", invite.use_count).select("id").maybeSingle();
    if (!consumed) throw new Error("Este convite acabou de ser utilizado. Solicite um novo link ao gestor.");

    // A notificação usa o próprio perfil criado como entidade destinatária.
    // Gestores enxergam as notificações do tenant pela política já existente.
    await sb.from("notifications").insert({
      driver_id: userId,
      tenant_id: invite.tenant_id,
      type: "info",
      title: "Novo cadastro de motorista",
      body: `${fullName} enviou os dados e aguarda análise.`,
      link: "/motoristas",
      entity_type: "driver_registration_request",
      entity_id: request.id,
    });

    return response({ data: { requestId: request.id, trackingToken, status: "pending" } }, 201);
  } catch (error) {
    await sb.auth.admin.deleteUser(userId);
    return response({ error: (error as Error).message ?? "Não foi possível enviar o cadastro." }, 400);
  }
}

async function registrationStatus(body: Json) {
  const requestId = cleanText(body.requestId, 50);
  const trackingToken = cleanText(body.trackingToken, 256);
  if (!requestId || !trackingToken) return response({ error: "Protocolo inválido." }, 400);
  const { data } = await admin().from("driver_registration_requests")
    .select("status, manager_note, reviewed_at, updated_at")
    .eq("id", requestId).eq("tracking_token_hash", await sha256(trackingToken)).maybeSingle();
  return data ? response({ data }) : response({ error: "Protocolo não encontrado." }, 404);
}

async function listRequests(req: Request, body: Json) {
  const manager = await managerContext(req);
  if (!manager) return response({ error: "Acesso de gestor necessário." }, 401);
  let query = admin().from("driver_registration_requests")
    .select("id, status, full_name, cpf, birth_date, cnh_number, cnh_category, cnh_expiry, email, phone, department_id, cnh_front_path, cnh_back_path, document_entry_mode, ai_confidence, manager_note, submitted_at, reviewed_at, departments(name)")
    .eq("tenant_id", manager.tenant_id)
    .order("submitted_at", { ascending: false });
  if (manager.role === "secretario" && manager.department_id) query = query.eq("department_id", manager.department_id);
  const status = cleanText(body.status, 30);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query.limit(100);
  if (error) return response({ error: error.message }, 400);
  const withUrls = await Promise.all((data ?? []).map(async (item: Json) => {
    const paths = [item.cnh_front_path, item.cnh_back_path].filter(Boolean) as string[];
    const urls = await Promise.all(paths.map(async (path) => {
      const { data: signed } = await admin().storage.from(BUCKET).createSignedUrl(path, 900);
      return signed?.signedUrl ?? null;
    }));
    return { ...item, cnhUrls: urls.filter(Boolean), cnh_front_path: undefined, cnh_back_path: undefined };
  }));
  return response({ data: withUrls });
}

async function notifyApproved(email: string, fullName: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REGISTRATION_EMAIL_FROM");
  if (!key || !from) return false;
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Seu acesso ao Exattus Rotta foi aprovado",
      html: `<p>Olá, ${fullName}.</p><p>Seu cadastro foi aprovado. Você já pode entrar no aplicativo usando seu CPF e a senha que escolheu.</p>`,
    }),
  });
  return result.ok;
}

async function reviewRequest(req: Request, body: Json) {
  const manager = await managerContext(req);
  if (!manager) return response({ error: "Acesso de gestor necessário." }, 401);
  const requestId = cleanText(body.requestId, 50);
  const decision = cleanText(body.decision, 30);
  if (!["approved", "needs_correction", "rejected"].includes(decision)) {
    return response({ error: "Decisão inválida." }, 400);
  }
  const sb = admin();
  let query = sb.from("driver_registration_requests")
    .select("id, auth_user_id, tenant_id, department_id, full_name, email, status")
    .eq("id", requestId).eq("tenant_id", manager.tenant_id);
  if (manager.role === "secretario" && manager.department_id) query = query.eq("department_id", manager.department_id);
  const { data } = await query.maybeSingle();
  if (!data) return response({ error: "Solicitação não encontrada." }, 404);
  if (data.status === "approved") return response({ error: "Esta solicitação já foi aprovada." }, 409);

  const note = cleanText(body.note, 1000) || null;
  if (decision !== "approved" && !note) return response({ error: "Informe o motivo para o motorista." }, 400);

  if (decision === "approved") {
    const { error: authError } = await sb.auth.admin.updateUserById(data.auth_user_id, { ban_duration: "none" });
    if (authError) return response({ error: authError.message }, 400);
    const { error: profileError } = await sb.from("profiles").update({
      registration_status: "approved",
      access_blocked: false,
      driver_status: "ativo",
      must_change_password: false,
    }).eq("id", data.auth_user_id);
    if (profileError) {
      await sb.auth.admin.updateUserById(data.auth_user_id, { ban_duration: "876000h" });
      return response({ error: profileError.message }, 400);
    }
  } else {
    await sb.from("profiles").update({
      registration_status: decision,
      access_blocked: true,
      driver_status: "inativo",
    }).eq("id", data.auth_user_id);
  }

  const { error } = await sb.from("driver_registration_requests").update({
    status: decision,
    manager_note: note,
    reviewed_by: manager.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", requestId);
  if (error) {
    if (decision === "approved") {
      await sb.auth.admin.updateUserById(data.auth_user_id, { ban_duration: "876000h" });
      await sb.from("profiles").update({
        registration_status: "pending",
        access_blocked: true,
        driver_status: "inativo",
      }).eq("id", data.auth_user_id);
    }
    return response({ error: error.message }, 400);
  }
  const notificationSent = decision === "approved"
    ? await notifyApproved(data.email, data.full_name).catch(() => false)
    : false;
  const phone = digits((await sb.from("profiles").select("phone").eq("id", data.auth_user_id).maybeSingle()).data?.phone);
  const whatsappNumber = phone.length >= 10 && phone.length <= 11 ? `55${phone}` : phone;
  const whatsappText = encodeURIComponent(
    `Olá, ${data.full_name}! Seu cadastro no Exattus Rotta foi aprovado. Você já pode entrar no aplicativo com seu CPF e a senha que escolheu.`,
  );
  const whatsappUrl = decision === "approved" && whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${whatsappText}`
    : null;
  return response({ data: { status: decision, notificationSent, whatsappUrl } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Json;
    switch (cleanText(body.action, 40)) {
      case "create_invite": return await createInvite(req, body);
      case "validate_invite": return await validateInvite(body);
      case "check_cpf": return await checkCpf(body);
      case "create_upload": return await createUpload(body);
      case "extract_cnh": return await extractCnh(body);
      case "submit": return await submitRegistration(body);
      case "status": return await registrationStatus(body);
      case "list_requests": return await listRequests(req, body);
      case "review": return await reviewRequest(req, body);
      default: return response({ error: "Ação inválida." }, 400);
    }
  } catch (error) {
    console.error("driver-registration:", error);
    return response({ error: (error as Error).message ?? "Erro inesperado." }, 500);
  }
});
