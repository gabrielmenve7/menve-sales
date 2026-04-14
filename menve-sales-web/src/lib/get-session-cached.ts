import { cache } from "react";
import { auth } from "@/auth";

/**
 * Uma leitura de sessão por request RSC — evita N chamadas a `auth()` quando vários
 * `apiServer` / helpers rodam em paralelo (ex.: página do Pipeline).
 */
export const getSessionCached = cache(auth);
