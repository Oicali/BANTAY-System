// Display-only role label map; never use output for logic or API payloads
const ROLE_DISPLAY_MAP = {
  patrol: "Patrol Officer",
  investigator: "Investigation Officer",
};

export const formatRole = (role) => {
  if (!role) return role; // keep null/undefined so `|| "—"` fallbacks still work
  return ROLE_DISPLAY_MAP[role.trim().toLowerCase()] || role;
};