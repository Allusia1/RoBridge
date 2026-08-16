/** Coerce manage_properties args so `set` + a properties map is not `Baseplate.nil`. */

export function normalizeManageProperties(args: Record<string, unknown>): Record<string, unknown> {
  const propertyRaw = args.property ?? args.propertyName;
  const property = typeof propertyRaw === "string" && propertyRaw.length > 0 ? propertyRaw : undefined;
  const value = args.value ?? args.amount;
  const properties = args.properties;
  let action = args.action;

  const hasMap =
    properties != null &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.keys(properties as object).length > 0;
  const hasSingle = property != null;

  if (action === "set" && hasMap && !hasSingle) {
    action = "set_many";
  }

  return { ...args, action, property, value };
}
