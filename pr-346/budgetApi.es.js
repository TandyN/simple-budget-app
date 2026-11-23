// src/core/validate.ts
var e = 1e5, t = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/, n = /^(\d{4})-(\d{2})$/, r = /^[A-Z]{3}$/, i = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]), a = /* @__PURE__ */ new Set(["cadence", "dayOfMonth"]), o = /* @__PURE__ */ new Set([
	"id",
	"name",
	"type",
	"amountCents",
	"currency",
	"schedule",
	"active",
	"lastPostPeriod",
	"createdAt",
	"updatedAt",
	"deletedAt",
	"deviceId"
]), s = /* @__PURE__ */ new Set([
	"name",
	"type",
	"amountCents",
	"currency",
	"schedule",
	"active"
]), c = /* @__PURE__ */ new Set([
	"name",
	"type",
	"amountCents",
	"schedule",
	"active"
]), l = /* @__PURE__ */ new Set([
	"id",
	"type",
	"amountCents",
	"currency",
	"dateTime",
	"tags",
	"source",
	"sourceRuleId",
	"period",
	"importBatchId",
	"externalTxnId",
	"sourceAccountId",
	"memo",
	"createdAt",
	"updatedAt",
	"deletedAt",
	"deviceId"
]), u = /* @__PURE__ */ new Set([
	"type",
	"amountCents",
	"currency",
	"dateTime",
	"tags",
	"memo"
]), d = /* @__PURE__ */ new Set([
	"type",
	"amountCents",
	"dateTime",
	"tags",
	"memo"
]), f = /* @__PURE__ */ new Set([
	"schemaVersion",
	"exportedAt",
	"rules",
	"activities"
]);
function p(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === Object.prototype || t === null;
}
function m(e, t = "payload") {
	if (typeof e == "object" && e) {
		if (Array.isArray(e)) for (let n = 0; n < e.length; n += 1) m(e[n], `${t}[${n}]`);
		else for (let n of Object.getOwnPropertyNames(e)) {
			if (i.has(n)) throw Error(`Invalid ${t}: forbidden prototype-pollution key "${n}"`);
			m(e[n], `${t}.${n}`);
		}
	}
}
function h(e, t, n) {
	if (!p(e)) throw Error(`Invalid ${n}: expected a plain object`);
	for (let r of Object.getOwnPropertyNames(e)) {
		if (i.has(r)) throw Error(`Invalid ${n}: forbidden prototype-pollution key "${r}"`);
		if (!t.has(r)) throw Error(`Invalid ${n}: unexpected property "${r}"`);
	}
	return e;
}
function g(e, t = "amountCents") {
	if (typeof e != "number" || !Number.isSafeInteger(e) || e <= 0) throw Error(`Invalid ${t}: must be a positive safe integer in minor units (cents)`);
	return e;
}
function _(e, n = "timestamp") {
	if (typeof e != "string") throw Error(`Invalid ${n}: must be an ISO-8601 UTC timestamp string`);
	let r = t.exec(e);
	if (!r) throw Error(`Invalid ${n}: must match YYYY-MM-DDTHH:mm:ss(.sss)Z`);
	let i = Number(r[1]), a = Number(r[2]), o = Number(r[3]), s = Number(r[4]), c = Number(r[5]), l = Number(r[6]);
	if (a < 1 || a > 12 || o < 1 || o > 31 || s > 23 || c > 59 || l > 59) throw Error(`Invalid ${n}: out-of-range calendar or clock component`);
	if (o > new Date(Date.UTC(i, a, 0)).getUTCDate()) throw Error(`Invalid ${n}: day ${o} does not exist in month ${r[1]}-${r[2]}`);
	return e;
}
function v(e, t = "period") {
	if (typeof e != "string") throw Error(`Invalid ${t}: must be a YYYY-MM string`);
	let r = n.exec(e);
	if (!r) throw Error(`Invalid ${t}: must match YYYY-MM`);
	let i = Number(r[2]);
	if (i < 1 || i > 12) throw Error(`Invalid ${t}: month must be between 01 and 12`);
	return e;
}
function y(e, t = "currency") {
	if (typeof e != "string" || !r.test(e)) throw Error(`Invalid ${t}: must be a 3-letter uppercase ISO-4217 code (e.g. "USD")`);
	return e;
}
function b(e, t, n, r = !0) {
	if (typeof e != "string") throw Error(`Invalid ${t}: must be a string`);
	if (r && e.trim().length === 0) throw Error(`Invalid ${t}: must be a non-empty string`);
	if (e.length > n) throw Error(`Invalid ${t}: length must be <= ${n} characters`);
	return e;
}
function x(e, t = "id") {
	return b(e, t, 64, !0);
}
function S(e, t) {
	return b(e, t, 128, !0);
}
function C(e, t = "name") {
	return b(e, t, 120, !0);
}
function w(e, t = "tags") {
	if (!Array.isArray(e)) throw Error(`Invalid ${t}: must be an array of strings`);
	if (e.length > 20) throw Error(`Invalid ${t}: must contain <= 20 tags`);
	let n = [];
	for (let r = 0; r < e.length; r += 1) n.push(b(e[r], `${t}[${r}]`, 120, !0));
	return n;
}
function T(e, t = "memo") {
	return b(e, t, 1e3, !1);
}
function E(e, t = "type") {
	if (e !== "income" && e !== "expense") throw Error(`Invalid ${t}: must be "income" or "expense"`);
	return e;
}
function D(e, t = "type") {
	if (e !== "income" && e !== "expense" && e !== "deposit") throw Error(`Invalid ${t}: must be "income", "expense", or "deposit"`);
	return e;
}
function O(e, t = "source") {
	if (e !== "manual" && e !== "recurring" && e !== "file-import" && e !== "bank-sync") throw Error(`Invalid ${t}: must be "manual", "recurring", "file-import", or "bank-sync"`);
	return e;
}
function k(e, t = "schedule") {
	let n = h(e, a, t);
	if (n.cadence !== "monthly") throw Error(`Invalid ${t}.cadence: must be "monthly"`);
	let r = n.dayOfMonth;
	if (typeof r != "number" || !Number.isSafeInteger(r) || r < 1 || r > 31) throw Error(`Invalid ${t}.dayOfMonth: must be an integer between 1 and 31`);
	return {
		cadence: "monthly",
		dayOfMonth: r
	};
}
function A(e, t = "RecurringRule") {
	let n = h(e, o, t), r = x(n.id, `${t}.id`), i = C(n.name, `${t}.name`), a = E(n.type, `${t}.type`), s = g(n.amountCents, `${t}.amountCents`), c = y(n.currency, `${t}.currency`), l = k(n.schedule, `${t}.schedule`);
	if (typeof n.active != "boolean") throw Error(`Invalid ${t}.active: must be a boolean`);
	let u;
	if (n.lastPostPeriod === null) u = null;
	else if (n.lastPostPeriod !== void 0) u = v(n.lastPostPeriod, `${t}.lastPostPeriod`);
	else throw Error(`Invalid ${t}.lastPostPeriod: must be a YYYY-MM string or null`);
	let d = _(n.createdAt, `${t}.createdAt`), f = _(n.updatedAt, `${t}.updatedAt`), p = {
		id: r,
		name: i,
		type: a,
		amountCents: s,
		currency: c,
		schedule: l,
		active: n.active,
		lastPostPeriod: u,
		createdAt: d,
		updatedAt: f
	};
	return n.deletedAt !== void 0 && (p.deletedAt = _(n.deletedAt, `${t}.deletedAt`)), n.deviceId !== void 0 && (p.deviceId = x(n.deviceId, `${t}.deviceId`)), p;
}
function j(e, t = "NewRule") {
	let n = h(e, s, t), r = {
		name: C(n.name, `${t}.name`),
		type: E(n.type, `${t}.type`),
		amountCents: g(n.amountCents, `${t}.amountCents`)
	};
	if (n.currency !== void 0 && (r.currency = y(n.currency, `${t}.currency`)), n.schedule !== void 0 && (r.schedule = k(n.schedule, `${t}.schedule`)), n.active !== void 0) {
		if (typeof n.active != "boolean") throw Error(`Invalid ${t}.active: must be a boolean`);
		r.active = n.active;
	}
	return r;
}
function M(e, t = "RulePatch") {
	let n = h(e, c, t), r = {};
	if (n.name !== void 0 && (r.name = C(n.name, `${t}.name`)), n.type !== void 0 && (r.type = E(n.type, `${t}.type`)), n.amountCents !== void 0 && (r.amountCents = g(n.amountCents, `${t}.amountCents`)), n.schedule !== void 0 && (r.schedule = k(n.schedule, `${t}.schedule`)), n.active !== void 0) {
		if (typeof n.active != "boolean") throw Error(`Invalid ${t}.active: must be a boolean`);
		r.active = n.active;
	}
	return r;
}
function N(e, t = "Activity") {
	let n = h(e, l, t), r = x(n.id, `${t}.id`), i = D(n.type, `${t}.type`), a = g(n.amountCents, `${t}.amountCents`), o = y(n.currency, `${t}.currency`), s = _(n.dateTime, `${t}.dateTime`), c = w(n.tags, `${t}.tags`), u = O(n.source, `${t}.source`), d = {
		id: r,
		type: i,
		amountCents: a,
		currency: o,
		dateTime: s,
		tags: c,
		source: u,
		createdAt: _(n.createdAt, `${t}.createdAt`),
		updatedAt: _(n.updatedAt, `${t}.updatedAt`)
	};
	if (u === "recurring") {
		if (n.sourceRuleId === void 0) throw Error(`Invalid ${t}.sourceRuleId: required when source === "recurring"`);
		if (n.period === void 0) throw Error(`Invalid ${t}.period: required when source === "recurring"`);
	}
	return n.sourceRuleId !== void 0 && (d.sourceRuleId = x(n.sourceRuleId, `${t}.sourceRuleId`)), n.period !== void 0 && (d.period = v(n.period, `${t}.period`)), n.importBatchId !== void 0 && (d.importBatchId = S(n.importBatchId, `${t}.importBatchId`)), n.externalTxnId !== void 0 && (d.externalTxnId = S(n.externalTxnId, `${t}.externalTxnId`)), n.sourceAccountId !== void 0 && (d.sourceAccountId = S(n.sourceAccountId, `${t}.sourceAccountId`)), n.memo !== void 0 && (d.memo = T(n.memo, `${t}.memo`)), n.deletedAt !== void 0 && (d.deletedAt = _(n.deletedAt, `${t}.deletedAt`)), n.deviceId !== void 0 && (d.deviceId = x(n.deviceId, `${t}.deviceId`)), d;
}
function P(e, t = "NewActivity") {
	let n = h(e, u, t), r = {
		type: D(n.type, `${t}.type`),
		amountCents: g(n.amountCents, `${t}.amountCents`)
	};
	return n.currency !== void 0 && (r.currency = y(n.currency, `${t}.currency`)), n.dateTime !== void 0 && (r.dateTime = _(n.dateTime, `${t}.dateTime`)), n.tags !== void 0 && (r.tags = w(n.tags, `${t}.tags`)), n.memo !== void 0 && (r.memo = T(n.memo, `${t}.memo`)), r;
}
function F(e, t = "ActivityPatch") {
	let n = h(e, d, t), r = {};
	return n.type !== void 0 && (r.type = D(n.type, `${t}.type`)), n.amountCents !== void 0 && (r.amountCents = g(n.amountCents, `${t}.amountCents`)), n.dateTime !== void 0 && (r.dateTime = _(n.dateTime, `${t}.dateTime`)), n.tags !== void 0 && (r.tags = w(n.tags, `${t}.tags`)), n.memo !== void 0 && (r.memo = T(n.memo, `${t}.memo`)), r;
}
function I(t) {
	if (typeof t != "string") throw Error("Invalid backup payload: rawJson must be a JSON string");
	let n = new TextEncoder().encode(t).byteLength;
	if (n > 10485760) throw Error(`Invalid backup payload: size ${n} bytes exceeds 10 MB ceiling (10485760 bytes)`);
	let r;
	try {
		r = JSON.parse(t, (e, t) => {
			if (i.has(e)) throw Error(`Forbidden prototype-pollution key "${e}"`);
			return t;
		});
	} catch (e) {
		throw Error(`Invalid backup payload JSON: ${e.message}`);
	}
	m(r, "backup");
	let a = h(r, f, "backup");
	if (a.schemaVersion !== 1) throw Error(`Invalid backup.schemaVersion: expected 1, got ${String(a.schemaVersion)}`);
	let o = _(a.exportedAt, "backup.exportedAt");
	if (!Array.isArray(a.rules)) throw Error("Invalid backup.rules: must be an array");
	if (a.rules.length > 1e5) throw Error(`Invalid backup.rules: length ${a.rules.length} exceeds cap (${e})`);
	if (!Array.isArray(a.activities)) throw Error("Invalid backup.activities: must be an array");
	if (a.activities.length > 1e5) throw Error(`Invalid backup.activities: length ${a.activities.length} exceeds cap (${e})`);
	let s = /* @__PURE__ */ new Set(), c = [], l = null;
	for (let e = 0; e < a.rules.length; e += 1) {
		let t = A(a.rules[e], `backup.rules[${e}]`);
		if (s.has(t.id)) throw Error(`Invalid backup.rules[${e}]: duplicate rule id "${t.id}"`);
		if (s.add(t.id), l === null) l = t.currency;
		else if (t.currency !== l) throw Error(`Invalid backup.rules[${e}].currency: mixed currencies not allowed (expected "${l}", got "${t.currency}")`);
		c.push(t);
	}
	let u = /* @__PURE__ */ new Set(), d = [];
	for (let e = 0; e < a.activities.length; e += 1) {
		let t = N(a.activities[e], `backup.activities[${e}]`);
		if (u.has(t.id)) throw Error(`Invalid backup.activities[${e}]: duplicate activity id "${t.id}"`);
		if (u.add(t.id), l === null) l = t.currency;
		else if (t.currency !== l) throw Error(`Invalid backup.activities[${e}].currency: mixed currencies not allowed (expected "${l}", got "${t.currency}")`);
		d.push(t);
	}
	return {
		schemaVersion: 1,
		exportedAt: o,
		rules: c,
		activities: d
	};
}
// src/core/engine.ts
function L(e) {
	let t = v(e, "period");
	return [Number(t.slice(0, 4)), Number(t.slice(5, 7))];
}
function R(e, t) {
	return `${String(e).padStart(4, "0")}-${String(t).padStart(2, "0")}`;
}
function z(e) {
	if (!(e instanceof Date) || Number.isNaN(e.getTime())) throw Error("Invalid now: must be a valid Date instance");
	return R(e.getUTCFullYear(), e.getUTCMonth() + 1);
}
function B(e) {
	let [t, n] = L(e);
	return n === 1 ? R(t - 1, 12) : R(t, n - 1);
}
function V(e, t, n) {
	let r = new Date(Date.UTC(t, n, 0)).getUTCDate(), i = Math.min(e.schedule.dayOfMonth, r);
	return new Date(Date.UTC(t, n - 1, i, 12, 0, 0));
}
function H(e, t) {
	let [n, r] = L(t);
	return V(e, n, r).toISOString();
}
function U(e, t, n, r) {
	if (!(r instanceof Date) || Number.isNaN(r.getTime())) throw Error("Invalid now: must be a valid Date instance");
	let [i, a] = L(t), o = v(n, "endInclusive"), s = [];
	for (;;) {
		let n = R(i, a);
		if (n > o) break;
		n !== t && V(e, i, a).getTime() <= r.getTime() && s.push(n), a += 1, a === 13 && (a = 1, i += 1);
	}
	return s;
}
function W(e, t, n) {
	return e.some((e) => e.deletedAt === void 0 && e.source === "recurring" && e.sourceRuleId === t && e.period === n);
}
function G(e) {
	let t = e.now ?? /* @__PURE__ */ new Date();
	if (!(t instanceof Date) || Number.isNaN(t.getTime())) throw Error("Invalid now: must be a valid Date instance");
	let n = z(t), r = e.idFactory ?? (() => crypto.randomUUID()), i = e.timestamp ?? t.toISOString(), a = [], o = [], s = [], c = [...e.activities];
	for (let l of e.rules) {
		let e = {
			...l,
			schedule: { ...l.schedule }
		};
		if (!l.active || l.deletedAt !== void 0) {
			s.push(e);
			continue;
		}
		let u = U(l, l.lastPostPeriod ?? B(n), n, t);
		for (let e of u) {
			if (W(c, l.id, e)) continue;
			let t = {
				id: r(),
				type: l.type,
				amountCents: l.amountCents,
				currency: l.currency,
				dateTime: H(l, e),
				tags: [],
				source: "recurring",
				sourceRuleId: l.id,
				period: e,
				memo: `Auto-posted: ${l.name}`,
				createdAt: i,
				updatedAt: i
			};
			a.push(t), c.push(t);
		}
		u.length > 0 && (e.lastPostPeriod = u[u.length - 1], e.updatedAt = i, o.push(e)), s.push(e);
	}
	return {
		posted: a,
		updatedRules: o,
		rules: s
	};
}
// src/core/funds.ts
function K(e) {
	let t = 0;
	for (let n of e) n.deletedAt === void 0 && (n.type === "expense" ? t -= n.amountCents : t += n.amountCents);
	return t;
}
// src/core/insights.ts
function q(e, t) {
	return e.filter((e) => (t.since === void 0 || e.dateTime >= t.since) && (t.until === void 0 || e.dateTime < t.until) && (t.tag === void 0 || e.tags.includes(t.tag)) && (t.type === void 0 || e.type === t.type));
}
function J(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) if (n.deletedAt === void 0) for (let e of n.tags) {
		let r = t.get(e);
		r || (r = {
			tag: e,
			totalInCents: 0,
			totalOutCents: 0
		}, t.set(e, r)), n.type === "expense" ? r.totalOutCents += n.amountCents : r.totalInCents += n.amountCents;
	}
	return [...t.values()].sort((e, t) => e.tag.localeCompare(t.tag));
}
// src/budgetApi.ts
var Y = "lastBackupAt";
function X(e) {
	let { adapter: t } = e, n = e.idFactory ?? (() => crypto.randomUUID()), r = e.now ?? (() => /* @__PURE__ */ new Date()), i = !1;
	function a() {
		if (!i) throw Error("createBudgetApi: call init() before using the API");
	}
	return {
		async init() {
			await t.open(), i = !0;
		},
		async addRule(e) {
			a();
			let i = j(e), o = r().toISOString(), s = {
				id: n(),
				name: i.name,
				type: i.type,
				amountCents: i.amountCents,
				currency: i.currency ?? "USD",
				schedule: i.schedule ?? {
					cadence: "monthly",
					dayOfMonth: 1
				},
				active: i.active ?? !0,
				lastPostPeriod: null,
				createdAt: o,
				updatedAt: o
			};
			return await t.save("rules", s), s;
		},
		async editRule(e, n) {
			a();
			let i = M(n), o = await Z(t, e);
			if (o === void 0) throw Error(`editRule: no rule with id "${e}"`);
			let s = {
				...o,
				...i,
				schedule: i.schedule ?? { ...o.schedule },
				updatedAt: r().toISOString()
			};
			return await t.save("rules", s), s;
		},
		async setRuleActive(e, n) {
			a();
			let i = await Z(t, e);
			if (i === void 0) throw Error(`setRuleActive: no rule with id "${e}"`);
			let o = {
				...i,
				active: n,
				updatedAt: r().toISOString()
			};
			return await t.save("rules", o), o;
		},
		async deleteRule(e) {
			a(), await t.delete("rules", e);
		},
		async listRules() {
			return a(), t.query("rules");
		},
		async addActivity(e) {
			a();
			let i = P(e), o = r().toISOString(), s = {
				id: n(),
				type: i.type,
				amountCents: i.amountCents,
				currency: i.currency ?? "USD",
				dateTime: i.dateTime ?? o,
				tags: i.tags ?? [],
				source: "manual",
				createdAt: o,
				updatedAt: o
			};
			return i.memo !== void 0 && (s.memo = i.memo), await t.save("activities", s), s;
		},
		async editActivity(e, n) {
			a();
			let i = F(n), o = await Q(t, e);
			if (o === void 0) throw Error(`editActivity: no activity with id "${e}"`);
			let s = {
				...o,
				...i,
				tags: i.tags ?? [...o.tags],
				updatedAt: r().toISOString()
			};
			return await t.save("activities", s), s;
		},
		async deleteActivity(e) {
			a(), await t.delete("activities", e);
		},
		async listActivities(e) {
			a();
			let n = await t.query("activities");
			return e === void 0 ? n : q(n, e);
		},
		async searchActivities(e) {
			return a(), q(await t.query("activities"), e);
		},
		async summarizeByTag(e) {
			return a(), J(e);
		},
		async runRecurringEngine(e) {
			a();
			let i = G({
				rules: await t.query("rules"),
				activities: await t.query("activities"),
				now: e ?? r(),
				idFactory: n
			});
			for (let e of i.posted) await t.save("activities", e);
			for (let e of i.updatedRules) await t.save("rules", e);
			return { posted: i.posted };
		},
		async getAvailableFunds() {
			return a(), K(await t.query("activities"));
		},
		async exportBackup() {
			a();
			let e = await t.query("rules"), n = await t.query("activities"), i = r().toISOString();
			return await t.setMeta(Y, i), {
				schemaVersion: 1,
				exportedAt: i,
				rules: e,
				activities: n
			};
		},
		async getLastBackupAt() {
			a();
			let e = await t.getMeta(Y);
			return typeof e == "string" ? e : null;
		},
		async importBackup(e) {
			a();
			let n = I(e);
			return await t.replaceAll({
				rules: n.rules,
				activities: n.activities
			}), {
				rulesCount: n.rules.length,
				activitiesCount: n.activities.length
			};
		}
	};
}
async function Z(e, t) {
	return (await e.query("rules")).find((e) => e.id === t);
}
async function Q(e, t) {
	return (await e.query("activities")).find((e) => e.id === t);
}
export { X as createBudgetApi };
