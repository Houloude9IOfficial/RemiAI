import { SESSION_COOKIE } from "./service";

const secure = process.env.NODE_ENV === "production";

export function setSessionCookie(response: Response, token: string, persistent: boolean) {
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    ...(persistent ? [`Max-Age=${30 * 86400}`] : []),
  ].join("; ");
  response.headers.append("Set-Cookie", cookie);
}

export function clearSessionCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}; Max-Age=0`,
  );
}
