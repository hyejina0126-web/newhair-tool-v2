// netlify/functions/log.js
// 팀 공유 제작 기록 저장소. Netlify Blobs 사용 — 별도 API 키/가입 불필요, Netlify에 배포되면 자동으로 동작함.
// GET  : 전체 기록 목록 반환 (최신순)
// POST : 새 기록 1건 추가
// DELETE?id=xxx : 기록 1건 삭제

const { getStore } = require("@netlify/blobs");

function todayKST(){
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const store = getStore({ name: "production-log", consistency: "strong" });
  const KEY = "records";

  try {
    if (event.httpMethod === "GET") {
      const records = (await store.get(KEY, { type: "json" })) || [];
      records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return { statusCode: 200, headers, body: JSON.stringify({ records }) };
    }

    if (event.httpMethod === "POST") {
      let payload;
      try { payload = JSON.parse(event.body || "{}"); }
      catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: "요청 본문이 올바른 JSON이 아닙니다." }) }; }

      if (!payload.contentType) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "contentType 값이 필요합니다." }) };
      }

      const record = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        date: payload.date || todayKST(),
        createdAt: new Date().toISOString(),
        channel: payload.channel || "",
        contentType: payload.contentType,
        author: payload.author || "",
        titles: payload.titles || [],       // 숏츠: [선택한 제목 1개] / 롱폼: [1안, 2안]
        thumbnails: payload.thumbnails || null, // 롱폼만: [1안, 2안] (각 {category,headline,sub})
        onscreenTitle: payload.onscreenTitle || "", // 숏츠만: 선택한 영상 내 제목
        description: payload.description || "",
        hashtags30: payload.hashtags30 || []
      };

      const records = (await store.get(KEY, { type: "json" })) || [];
      records.push(record);
      await store.setJSON(KEY, records);

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, record }) };
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "id 파라미터가 필요합니다." }) };
      const records = (await store.get(KEY, { type: "json" })) || [];
      const next = records.filter(r => r.id !== id);
      await store.setJSON(KEY, next);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "지원하지 않는 메서드입니다." }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "저장소 오류: " + e.message }) };
  }
};
