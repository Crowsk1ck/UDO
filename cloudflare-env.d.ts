declare namespace Cloudflare {
  interface Env {
    UDO_ADMIN_USER?: string;
    UDO_ADMIN_PASSWORD?: string;
    ASSETS?: Fetcher;
    DB?: D1Database;
  }
}
