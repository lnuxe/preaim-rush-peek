/**
 * 排行榜：本地成绩榜，按公网 IP 区分玩家
 * - 同一 IP 只保留最高成绩（击杀 > 命中率 > 时间新者优先）
 * - 排序：击杀数 > 命中率 > 时间（越新越靠前）
 * - 评级：击杀数为主，加权命中率 / 最高连杀 / KPS 的综合评分
 */

const KEY = "preaim.ranking.v1";
const MAX = 30;

/** 读取排行榜（已按击杀降序） */
export function loadRanking() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/** 比较两条成绩：返回正数表示 a 更优 */
function better(a, b) {
  if (a.kills !== b.kills) return a.kills - b.kills;
  if ((a.accuracy || 0) !== (b.accuracy || 0)) return (a.accuracy || 0) - (b.accuracy || 0);
  return (a.date || 0) - (b.date || 0);
}

/**
 * 追加一条成绩并返回最新榜单
 * 同一 IP 只保留最高成绩：新成绩更优则替换，否则忽略
 */
export function addScore(entry) {
  const list = loadRanking();
  const rec = { ...entry, date: Date.now() };

  // 有 IP 标识的记录按 IP 去重
  if (rec.ip) {
    const idx = list.findIndex((x) => x.ip && x.ip === rec.ip);
    if (idx >= 0) {
      if (better(rec, list[idx]) <= 0) return list; // 新成绩未超越，不入榜
      list[idx] = rec;
    } else {
      list.push(rec);
    }
  } else {
    list.push(rec);
  }

  list.sort((a, b) =>
    (b.kills - a.kills) ||
    ((b.accuracy || 0) - (a.accuracy || 0)) ||
    (a.date - b.date)
  );
  const trimmed = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch (e) { /* 隐私模式等场景忽略 */ }
  return trimmed;
}

/** 清空排行榜：有 ip 时只清该 IP 的记录，否则清空全部 */
export function clearRanking(ip) {
  try {
    const list = loadRanking();
    const kept = ip ? list.filter((x) => x.ip !== ip) : [];
    localStorage.setItem(KEY, JSON.stringify(ip ? kept : []));
  } catch (e) {}
}

/**
 * 综合评级（60s 单局）：击杀数为主，加权命中率 / 最高连杀 / KPS
 * score = kills×10 + 命中率×2 + 最高连杀×5 + KPS×40
 * 参考：40 杀+高命中的高手约 550+，20 杀左右中等约 250，10 杀以下新手约 120 以下
 */
export function rankFor(s) {
  const isNum = typeof s === "number";
  const kills = isNum ? s : (s?.kills || 0);
  const accuracy = isNum ? 0 : (s?.accuracy || 0);
  const bestStreak = isNum ? 0 : (s?.bestStreak || 0);
  const kps = isNum ? 0 : (parseFloat(s?.kps) || 0);

  const score = kills * 10 + accuracy * 2 + bestStreak * 5 + kps * 40;
  if (score >= 500) return "S";
  if (score >= 350) return "A";
  if (score >= 220) return "B";
  if (score >= 120) return "C";
  return "D";
}
