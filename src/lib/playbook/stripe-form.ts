/**
 * Encodes nested values the way Stripe's API expects form bodies:
 * `a[b][0][c]=value`. Undefined values are left out.
 */
export function stripeForm(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        add(`${key}[${String(index)}]`, item);
      });
    } else if (typeof value === "object") {
      for (const [child, inner] of Object.entries(value)) {
        add(`${key}[${child}]`, inner);
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      params.append(key, String(value));
    }
  };
  for (const [key, value] of Object.entries(values)) add(key, value);
  return params.toString();
}
