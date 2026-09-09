interface SessionClient {
  rpc(
    name: "assert_server_session",
    args: { p_user_id: string; p_session_id: string },
  ): PromiseLike<{ error: { code?: string } | null }>;
}

/** Call only AFTER auth.getUser(token) verifies the JWT. Never log the token. */
export async function assertServerSession(
  admin: SessionClient,
  userId: string,
  verifiedToken: string,
): Promise<void> {
  let sessionId: unknown;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(verifiedToken.split(".")[1], "base64url").toString("utf8"),
    );
    if (claims && typeof claims === "object" && "session_id" in claims)
      sessionId = claims.session_id;
  } catch {
    /* Missing/invalid claims fail closed below. */
  }
  if (
    typeof sessionId !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sessionId)
  ) {
    throw Object.assign(new Error("Sessão inválida. Entre novamente."), {
      status: 401,
    });
  }
  const { error } = await admin.rpc("assert_server_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error)
    throw Object.assign(
      new Error(
        error.code === "42501"
          ? "Sessão revogada ou acesso bloqueado. Entre novamente."
          : "Não foi possível verificar a sessão. Tente novamente.",
      ),
      { status: error.code === "42501" ? 401 : 503 },
    );
}
