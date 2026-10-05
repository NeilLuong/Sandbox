import { createStore, isDemo } from "./db.js";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const FLAG_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 21V4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const $ = (id) => document.getElementById(id);
const form = $("problem-form");
const fields = form.elements;
const tagEntry = $("tag-entry");

let store;
let rows = [];
let loadError = null;
let editingId = null;
let formTags = [];
let suggestedTags = [];
// Title/difficulty most recently filled in from the problem list. A field still
// holding its auto value may be replaced when the number changes; anything the
// user typed (or loaded from a saved entry) is left alone.
let auto = { title: "", difficulty: "" };
// number -> { title, difficulty, tags } from problems.json
const catalog = { problems: new Map(), tags: [] };

start();

// ---------- Startup & sign-in ----------

async function start() {
  loadCatalog();
  try {
    store = await createStore();
  } catch (err) {
    $("loading-view").firstElementChild.textContent = `Couldn't connect to Supabase: ${err.message}`;
    return;
  }
  $("demo-banner").hidden = !isDemo;
  store.onSignedOut(() => showView("login"));
  if (isDemo) return enterApp(null);
  const user = await store.getUser();
  if (user) enterApp(user);
  else showView("login");
}

function showView(name) {
  for (const view of ["loading", "login", "app"]) $(`${view}-view`).hidden = view !== name;
  $("stats").hidden = name !== "app";
  if (name !== "app") $("account").hidden = true;
}

async function enterApp(user) {
  $("account").hidden = !user;
  $("user-email").textContent = user?.email ?? "";
  showView("app");
  resetForm();
  try {
    rows = await store.list();
    loadError = null;
  } catch (err) {
    rows = [];
    loadError = err.message;
  }
  render();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const loginForm = e.currentTarget;
  const button = loginForm.querySelector("button");
  $("login-error").textContent = "";
  button.disabled = true;
  try {
    const user = await store.signIn(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
    loginForm.reset();
    await enterApp(user);
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$("sign-out").addEventListener("click", async () => {
  await store.signOut();
  rows = [];
  showView("login");
});

async function loadCatalog() {
  try {
    const data = await fetch("problems.json").then((res) => res.json());
    catalog.tags = data.tags;
    for (const [number, title, difficulty, tags] of data.problems) {
      catalog.problems.set(number, {
        title,
        difficulty: DIFFICULTIES[difficulty],
        tags: tags.map((i) => data.tags[i]),
      });
    }
    renderTagOptions();
    if (fields.number.value) onNumberInput();
  } catch {
    // Auto-fill is a convenience; the form still works without the list.
  }
}

// ---------- The add / edit form ----------

fields.number.addEventListener("input", onNumberInput);

function onNumberInput() {
  const number = readNumber();
  const known = number ? catalog.problems.get(number) : undefined;
  if (fields.title.value === auto.title) fields.title.value = auto.title = known?.title ?? "";
  if (fields.difficulty.value === auto.difficulty) {
    fields.difficulty.value = auto.difficulty = known?.difficulty ?? "";
  }
  renderSuggestions(known?.tags ?? []);

  const hint = $("number-hint");
  hint.replaceChildren();
  const existing = number && rows.find((r) => r.number === number && r.id !== editingId);
  if (existing) {
    hint.append(
      `#${number} is already in your log. `,
      el("button", { type: "button", class: "link", onclick: () => startEdit(existing) }, "Edit it"),
    );
  } else if (number && catalog.problems.size && !known) {
    hint.append("Not in the problem list (new or premium?), so type the title yourself.");
  }
}

function readNumber() {
  const n = Number(fields.number.value.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Enter moves through the form instead of submitting it early.
fields.number.addEventListener("keydown", (e) => {
  if (!isPlainEnter(e)) return;
  e.preventDefault();
  (fields.title.value ? tagEntry : fields.title).focus();
});
fields.title.addEventListener("keydown", (e) => {
  if (!isPlainEnter(e)) return;
  e.preventDefault();
  tagEntry.focus();
});

tagEntry.addEventListener("keydown", (e) => {
  if (isPlainEnter(e)) {
    e.preventDefault();
    if (tagEntry.value.trim()) commitTagEntry();
    else fields.description.focus();
  } else if (e.key === ",") {
    e.preventDefault();
    commitTagEntry();
  } else if (e.key === "Backspace" && !tagEntry.value && formTags.length) {
    formTags.pop();
    renderFormTags();
  }
});

// Picking an option from the dropdown adds it straight away.
tagEntry.addEventListener("input", (e) => {
  const picked = !e.inputType || e.inputType === "insertReplacementText";
  if (picked && allTagOptions().includes(tagEntry.value)) commitTagEntry();
});

form.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    form.requestSubmit();
  } else if (e.key === "Escape" && editingId) {
    resetForm();
  }
});

$("cancel-edit").addEventListener("click", resetForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  commitTagEntry();
  const number = readNumber();
  if (!number) return toast("Enter a valid problem number.", true);

  const data = {
    number,
    title: fields.title.value.trim(),
    difficulty: fields.difficulty.value || null,
    tags: formTags,
    description: fields.description.value.trim(),
    needs_review: fields.needs_review.checked,
  };
  const saveButton = $("save-btn");
  saveButton.disabled = true;
  try {
    const saved = editingId ? await store.update(editingId, data) : await store.create(data);
    replaceRow(saved);
    resetForm();
    render();
    toast(`Saved ${label(saved)}`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

function startEdit(row) {
  editingId = row.id;
  auto = { title: "", difficulty: "" };
  fields.number.value = row.number;
  fields.title.value = row.title;
  fields.difficulty.value = row.difficulty ?? "";
  fields.description.value = row.description;
  fields.needs_review.checked = row.needs_review;
  formTags = [...row.tags];
  tagEntry.value = "";
  renderFormTags();
  renderSuggestions(catalog.problems.get(row.number)?.tags ?? []);
  $("number-hint").replaceChildren();
  $("form-title").textContent = `Editing ${label(row)}`;
  $("cancel-edit").hidden = false;
  $("save-btn").textContent = "Save changes";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  fields.description.focus({ preventScroll: true });
}

function resetForm() {
  form.reset();
  editingId = null;
  auto = { title: "", difficulty: "" };
  formTags = [];
  renderFormTags();
  renderSuggestions([]);
  $("number-hint").replaceChildren();
  $("form-title").textContent = "Add a problem";
  $("cancel-edit").hidden = true;
  $("save-btn").textContent = "Save";
  fields.number.focus();
}

// ---------- Tags in the form ----------

function commitTagEntry() {
  addTag(tagEntry.value);
  tagEntry.value = "";
}

function addTag(raw) {
  const name = raw.trim();
  if (!name || formTags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
  // Reuse an existing spelling, so "two pointers" becomes "Two Pointers".
  formTags.push(allTagOptions().find((t) => t.toLowerCase() === name.toLowerCase()) ?? name);
  renderFormTags();
}

function renderFormTags() {
  const box = $("tag-box");
  box.querySelectorAll(".chip").forEach((chip) => chip.remove());
  tagEntry.before(
    ...formTags.map((tag) =>
      el("span", { class: "chip" }, tag,
        el("button", {
          type: "button",
          class: "chip-x",
          "aria-label": `Remove ${tag}`,
          onclick: () => {
            formTags = formTags.filter((t) => t !== tag);
            renderFormTags();
            tagEntry.focus();
          },
        }, "×"),
      ),
    ),
  );
  renderSuggestions(suggestedTags);
}

function renderSuggestions(tags) {
  suggestedTags = tags;
  const remaining = tags.filter((t) => !formTags.includes(t));
  $("tag-suggestions").replaceChildren(
    ...(remaining.length
      ? [
          el("span", { class: "muted small" }, "LeetCode tags:"),
          ...remaining.map((t) =>
            el("button", { type: "button", class: "chip suggestion", onclick: () => addTag(t) }, `+ ${t}`),
          ),
        ]
      : []),
  );
}

function allTagOptions() {
  return [...new Set([...rows.flatMap((r) => r.tags), ...catalog.tags])];
}

function renderTagOptions() {
  $("tag-options").replaceChildren(...allTagOptions().map((t) => el("option", { value: t })));
}

// ---------- The list ----------

const byNumber = (a, b) => a.number - b.number;
const difficultyRank = (r) => (r.difficulty ? DIFFICULTIES.indexOf(r.difficulty) : DIFFICULTIES.length);
const SORTS = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  number: byNumber,
  difficulty: (a, b) => difficultyRank(a) - difficultyRank(b) || byNumber(a, b),
};

$("search").addEventListener("input", renderList);
for (const id of ["filter-tag", "filter-diff", "sort", "filter-review"]) {
  $(id).addEventListener("change", renderList);
}

function render() {
  renderStats();
  renderFilterOptions();
  renderTagOptions();
  renderList();
}

function renderStats() {
  const review = rows.filter((r) => r.needs_review).length;
  $("stats").replaceChildren(
    el("span", {}, el("strong", {}, String(rows.length)), " solved"),
    ...DIFFICULTIES.map((d) =>
      el("span", { class: `stat ${d.toLowerCase()}` }, String(rows.filter((r) => r.difficulty === d).length), ` ${d}`),
    ),
    review ? el("span", { class: "stat review" }, String(review), " to review") : "",
  );
}

function renderFilterOptions() {
  const select = $("filter-tag");
  const current = select.value;
  const counts = new Map();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  select.replaceChildren(
    el("option", { value: "" }, "All types"),
    ...tags.map((t) => el("option", { value: t }, `${t} (${counts.get(t)})`)),
  );
  select.value = counts.has(current) ? current : "";
}

function renderList() {
  const query = $("search").value.trim().toLowerCase().replace(/^#/, "");
  const tag = $("filter-tag").value;
  const difficulty = $("filter-diff").value;
  const reviewOnly = $("filter-review").checked;

  const visible = rows
    .filter(
      (r) =>
        (!tag || r.tags.includes(tag)) &&
        (!difficulty || r.difficulty === difficulty) &&
        (!reviewOnly || r.needs_review) &&
        (!query ||
          String(r.number).startsWith(query) ||
          [r.title, r.description, ...r.tags].some((s) => s.toLowerCase().includes(query))),
    )
    .sort(SORTS[$("sort").value]);

  $("problem-list").replaceChildren(...visible.map(renderItem));
  $("result-count").textContent = rows.length ? `Showing ${visible.length} of ${rows.length}` : "";

  const empty = $("empty");
  empty.classList.toggle("error", Boolean(loadError));
  if (loadError) {
    empty.textContent = `Couldn't load your problems: ${loadError}. On a new Supabase project, run supabase/schema.sql in the SQL Editor first.`;
  } else if (!rows.length) {
    empty.textContent = "No problems yet. Add your first one with the form.";
  } else {
    empty.textContent = "No problems match these filters.";
  }
  empty.hidden = Boolean(visible.length) && !loadError;
}

function renderItem(r) {
  const link = r.title
    ? `https://leetcode.com/problems/${slugify(r.title)}/`
    : `https://leetcode.com/problemset/?search=${r.number}`;
  const flag = el("span", { class: "flag" });
  flag.innerHTML = FLAG_SVG;
  const edited = fmtDate(r.updated_at) !== fmtDate(r.created_at);

  return el("li", { class: "item" },
    el("div", { class: "item-head" },
      el("a", { class: "item-title", href: link, target: "_blank", rel: "noopener" },
        el("span", { class: "num" }, `#${r.number}`), " ", r.title || "Untitled"),
      r.difficulty && el("span", { class: `badge ${r.difficulty.toLowerCase()}` }, r.difficulty),
      el("div", { class: "item-actions" },
        el("button", {
          type: "button",
          class: `review-toggle${r.needs_review ? " on" : ""}`,
          "aria-pressed": String(r.needs_review),
          title: r.needs_review ? "Marked for review (click to clear)" : "Mark for review",
          onclick: () => toggleReview(r),
        }, flag, el("span", { class: "review-label" }, "Review")),
        el("button", { type: "button", class: "ghost small", onclick: () => startEdit(r) }, "Edit"),
        el("button", { type: "button", class: "ghost small danger", onclick: () => removeRow(r) }, "Delete"),
      ),
    ),
    r.tags.length > 0 &&
      el("div", { class: "chips" },
        ...r.tags.map((t) =>
          el("button", { type: "button", class: "chip", title: `Show only ${t}`, onclick: () => setTagFilter(t) }, t),
        ),
      ),
    r.description &&
      el("p", {
        class: "desc",
        title: "Click to expand",
        onclick: (e) => e.currentTarget.classList.toggle("expanded"),
      }, r.description),
    el("div", { class: "meta" }, `Added ${fmtDate(r.created_at)}`, edited ? ` · edited ${fmtDate(r.updated_at)}` : ""),
  );
}

function setTagFilter(tag) {
  $("filter-tag").value = tag;
  renderList();
}

async function toggleReview(row) {
  try {
    const saved = await store.update(row.id, { needs_review: !row.needs_review });
    replaceRow(saved);
    if (editingId === saved.id) fields.needs_review.checked = saved.needs_review;
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

async function removeRow(row) {
  if (!confirm(`Delete ${label(row)}? This can't be undone.`)) return;
  try {
    await store.remove(row.id);
    rows = rows.filter((r) => r.id !== row.id);
    if (editingId === row.id) resetForm();
    render();
    toast(`Deleted ${label(row)}`);
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- Helpers ----------

function replaceRow(saved) {
  rows = [...rows.filter((r) => r.id !== saved.id), saved];
}

function label(row) {
  return row.title ? `#${row.number} ${row.title}` : `#${row.number}`;
}

// "Two Sum II - Input Array Is Sorted" -> "two-sum-ii-input-array-is-sorted"
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-");
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isPlainEnter(e) {
  return e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.isComposing;
}

// Builds a DOM element. Children are appended as text, never parsed as HTML.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== false && c !== null && c !== undefined && c !== ""));
  return node;
}

let toastTimer;
function toast(message, isError = false) {
  const node = $("toast");
  node.textContent = message;
  node.classList.toggle("error", isError);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), isError ? 5000 : 2500);
}
