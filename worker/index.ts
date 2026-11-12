import { identity, authRoute } from './auth';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const pathname = new URL(request.url).pathname;
    const user = await identity(request, env);
    const auth = await authRoute(request, env, user);
    if (auth) return auth;
    if (!user) return pathname.startsWith('/api/')
      ? new Response('Увійдіть до панелі', {status:401})
      : Response.redirect(new URL('/login', request.url).href, 303);
    const headers = new Headers(request.headers);
    headers.set('x-udo-user', JSON.stringify(user));
    headers.set('oai-authenticated-user-email', user.username);
    request = new Request(request, {headers});
    if (!import.meta.env.DEV && env.ASSETS && (pathname.startsWith('/_next/') || pathname === '/favicon.svg')) {
      return env.ASSETS.fetch(request);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
