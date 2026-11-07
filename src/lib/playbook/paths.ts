import { playbookConfig } from "@/config/playbook";

/**
 * A Playbook page path for the host serving it: the sub-domain serves the
 * sales page at "/", any other host (deploy previews, local) at "/playbook".
 */
export function playbookPath(host: string | null, path = "/"): string {
  const onSubdomain = host?.split(":")[0] === playbookConfig.host;
  if (onSubdomain) return path;
  return path === "/" ? "/playbook" : `/playbook${path}`;
}

/**
 * A 303 to a path on the host the browser used. The Location is relative
 * so it never points at the platform's internal host name (on Netlify,
 * request.url can name main--<site>.netlify.app instead of the sub-domain).
 */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
