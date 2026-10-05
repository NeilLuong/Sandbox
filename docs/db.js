// Storage for problems: Supabase when config.js is filled in, otherwise
// localStorage (demo mode). Both expose the same async interface.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const DUPLICATE = "That problem number is already in your log.";

export function createStore() {
  return isDemo ? localStore() : supabaseStore();
}

async function supabaseStore() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const table = () => supabase.from("problems");
  const columns = "id, number, title, difficulty, tags, description, needs_review, created_at, updated_at";

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(error.code === "23505" ? DUPLICATE : error.message);
    return data;
  };

  return {
    async getUser() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user ?? null;
    },
    onSignedOut(callback) {
      supabase.auth.onAuthStateChange((event) => event === "SIGNED_OUT" && callback());
    },
    async signIn(email, password) {
      return unwrap(await supabase.auth.signInWithPassword({ email, password })).user;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async list() {
      return unwrap(await table().select(columns));
    },
    async create(row) {
      return unwrap(await table().insert(row).select(columns).single());
    },
    async update(id, patch) {
      return unwrap(await table().update(patch).eq("id", id).select(columns).single());
    },
    async remove(id) {
      unwrap(await table().delete().eq("id", id));
    },
  };
}

function localStore() {
  const KEY = "leetcode-log:demo";
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) ?? [];
    } catch {
      return [];
    }
  };
  const save = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));
  const assertUnique = (rows, number, id) => {
    if (rows.some((r) => r.number === number && r.id !== id)) throw new Error(DUPLICATE);
  };

  return {
    async getUser() {
      return null;
    },
    onSignedOut() {},
    async signIn() {},
    async signOut() {},
    async list() {
      return load();
    },
    async create(row) {
      const rows = load();
      assertUnique(rows, row.number);
      const now = new Date().toISOString();
      const created = { id: Math.max(0, ...rows.map((r) => r.id)) + 1, ...row, created_at: now, updated_at: now };
      save([...rows, created]);
      return created;
    },
    async update(id, patch) {
      const rows = load();
      if (patch.number !== undefined) assertUnique(rows, patch.number, id);
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("That entry no longer exists.");
      rows[i] = { ...rows[i], ...patch, updated_at: new Date().toISOString() };
      save(rows);
      return rows[i];
    },
    async remove(id) {
      save(load().filter((r) => r.id !== id));
    },
  };
}
