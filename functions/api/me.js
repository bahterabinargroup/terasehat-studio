import { publicUser } from "../../lib/auth.js";

export async function onRequestGet({ data }) {
  return Response.json({ ok: true, user: publicUser(data.user) });
}
