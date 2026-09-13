/* ==========================================================================
   Trilha Gramatical — autenticação via Supabase (login, cadastro, troca de senha)
   Preencha SUPABASE_URL e SUPABASE_ANON_KEY abaixo com os dados do seu projeto
   (Supabase → Project Settings → API). A "anon key" é pública por design —
   a segurança real vem das políticas RLS criadas em schema.sql.
   ========================================================================== */

const SUPABASE_URL = "COLE_AQUI_A_SUA_SUPABASE_URL";
const SUPABASE_ANON_KEY = "COLE_AQUI_A_SUA_SUPABASE_ANON_KEY";

let supabaseClient = null;
let currentSession = null;

function initSupabase() {
  if (!window.supabase) {
    console.error("Biblioteca supabase-js não carregada.");
    return null;
  }
  if (SUPABASE_URL.startsWith("COLE_AQUI") || SUPABASE_ANON_KEY.startsWith("COLE_AQUI")) {
    document.getElementById("authError").textContent =
      "Configuração pendente: preencha SUPABASE_URL e SUPABASE_ANON_KEY em auth.js.";
    document.getElementById("authError").classList.remove("hidden");
    return null;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function showAuthMessage(msg, isError) {
  const el = document.getElementById("authError");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("auth-error", !!isError);
  el.classList.toggle("auth-success", !isError);
}

function clearAuthMessage() {
  const el = document.getElementById("authError");
  el.classList.add("hidden");
  el.textContent = "";
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
async function doLogin(email, password) {
  clearAuthMessage();
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthMessage(traduzErroAuth(error.message), true);
    return false;
  }
  currentSession = data.session;
  return true;
}

// ---------------------------------------------------------------------------
// Cadastro (opcional — use se quiser permitir criar novas contas pelo app)
// ---------------------------------------------------------------------------
async function doSignup(email, password) {
  clearAuthMessage();
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    showAuthMessage(traduzErroAuth(error.message), true);
    return false;
  }
  if (data.session) {
    currentSession = data.session;
    return true;
  }
  showAuthMessage("Conta criada! Verifique seu e-mail para confirmar antes de entrar.", false);
  return false;
}

// ---------------------------------------------------------------------------
// Troca de senha (usuário já logado)
// ---------------------------------------------------------------------------
async function doChangePassword(currentPassword, newPassword) {
  clearAuthMessage();
  // Reautentica com a senha atual antes de trocar, por segurança.
  const email = currentSession && currentSession.user ? currentSession.user.email : null;
  if (!email) {
    showAuthMessage("Sessão inválida. Faça login novamente.", true);
    return false;
  }
  const { error: reauthError } = await supabaseClient.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) {
    showAuthMessage("Senha atual incorreta.", true);
    return false;
  }
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) {
    showAuthMessage(traduzErroAuth(error.message), true);
    return false;
  }
  showAuthMessage("Senha alterada com sucesso!", false);
  return true;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
async function doLogout() {
  await supabaseClient.auth.signOut();
  currentSession = null;
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Sessão atual / restaurar sessão salva
// ---------------------------------------------------------------------------
async function restoreSession() {
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;
  return currentSession;
}

function traduzErroAuth(msg) {
  const map = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "User already registered": "Este e-mail já possui uma conta.",
    "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).",
  };
  return map[msg] || msg;
}

// ---------------------------------------------------------------------------
// Sincronização de progresso com a tabela public.progress
// ---------------------------------------------------------------------------
async function fetchRemoteProgress() {
  if (!currentSession) return null;
  const { data, error } = await supabaseClient
    .from("progress")
    .select("*")
    .eq("user_id", currentSession.user.id)
    .maybeSingle();
  if (error) {
    console.error("Erro ao buscar progresso:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    score: data.score,
    energy: data.energy,
    unitsCompleted: data.units_completed || {},
    lastUnit: data.last_unit,
  };
}

let _syncTimer = null;
function pushRemoteProgressDebounced(progressObj) {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => pushRemoteProgress(progressObj), 800);
}

async function pushRemoteProgress(progressObj) {
  if (!currentSession) return;
  const payload = {
    user_id: currentSession.user.id,
    score: progressObj.score,
    energy: progressObj.energy,
    units_completed: progressObj.unitsCompleted,
    last_unit: progressObj.lastUnit,
  };
  const { error } = await supabaseClient.from("progress").upsert(payload, { onConflict: "user_id" });
  if (error) console.error("Erro ao salvar progresso na nuvem:", error.message);
}
