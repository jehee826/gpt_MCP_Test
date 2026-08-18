import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";

// ── Discord Webhook 설정 ──────────────────────────────────────
// 반드시 환경변수로 관리하세요. Render 대시보드 → Environment 탭에서
// DISCORD_WEBHOOK_URL 값을 설정하세요.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!DISCORD_WEBHOOK_URL) {
  console.error("[SERVER] ❌ DISCORD_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

// ── 간단한 레이트 리밋 가드 ─────────────────────────────────────
// Discord 웹훅은 매우 타이트한 레이트 리밋(초당 약 5회, 채널당 분당 약 30회)이
// 있으므로, 요청 간 최소 간격을 강제해서 429를 예방합니다.
const MIN_INTERVAL_MS = 1200; // 요청 간 최소 간격 (필요시 조정)
let lastRequestTime = 0;
let requestQueue = Promise.resolve(); // 동시 요청도 순차적으로 처리

function sendToDiscordQueued(payload) {
  // 이전 요청이 끝난 뒤에만 다음 요청을 보내도록 큐에 연결
  const task = requestQueue.then(() => sendToDiscord(payload));
  // 실패해도 큐가 끊기지 않도록 catch로 흡수
  requestQueue = task.catch(() => {});
  return task;
}

// Content-Type과 본문 앞부분을 보고 Cloudflare/프록시 차단 페이지인지 판별
function isHtmlBlockPage(response, bodyText) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) return true;
  const trimmed = bodyText.trim();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

async function postOnce(payload) {
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const bodyText = await response.text();
  return { response, bodyText };
}

async function sendToDiscord(payload) {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();

  const { response, bodyText } = await postOnce(payload);

  console.log("[DISCORD] HTTP Status:", response.status);

  // Cloudflare(또는 다른 프록시)가 요청을 가로채 HTML 에러/챌린지 페이지를
  // 돌려주는 경우 — Discord API가 실제로 응답한 게 아니므로 JSON 파싱을
  // 시도하지 않고, 로그도 앞부분만 남깁니다.
  if (isHtmlBlockPage(response, bodyText)) {
    console.error(
      "[DISCORD] ⚠️ HTML 차단/에러 페이지 수신 (Discord가 아닌 프록시/Cloudflare 응답) — status:",
      response.status,
      "body 앞부분:",
      bodyText.slice(0, 200).replace(/\s+/g, " ")
    );
    throw new Error(
      `디스코드 웹훅에 도달하지 못했습니다 (HTTP ${response.status}, HTML 응답 — Cloudflare 차단 가능성). ` +
        `Render 아웃바운드 IP가 일시적으로 제한됐을 수 있어요. 잠시 후 다시 시도해주세요.`
    );
  }

  console.log("[DISCORD] Response Body:", bodyText);

  if (response.status === 429) {
    let retryAfter = null;
    let isGlobal = null;
    try {
      const rateLimitData = JSON.parse(bodyText);
      retryAfter = rateLimitData.retry_after;
      isGlobal = rateLimitData.global;
      console.error("[DISCORD] ⚠️ RATE LIMIT — retry_after:", retryAfter, "global:", isGlobal);
    } catch {
      console.error("[DISCORD] Rate Limit 응답 JSON 파싱 실패");
    }

    // Discord가 알려준 시간만큼 실제로 기다렸다가 한 번 재시도
    if (retryAfter) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 200));
      lastRequestTime = Date.now();
      const { response: retryResponse, bodyText: retryText } = await postOnce(payload);
      console.log("[DISCORD] 재시도 Status:", retryResponse.status);

      if (isHtmlBlockPage(retryResponse, retryText)) {
        throw new Error(
          `재시도에서도 HTML 차단 페이지를 받았습니다 (HTTP ${retryResponse.status}). Cloudflare가 IP를 계속 막고 있을 가능성이 높습니다.`
        );
      }
      if (!retryResponse.ok) {
        throw new Error(`디스코드 전송 실패(재시도 후): HTTP ${retryResponse.status} / ${retryText}`);
      }
      return retryText;
    }
  }

  if (!response.ok) {
    throw new Error(`디스코드 전송 실패: HTTP ${response.status} ${response.statusText} / ${bodyText}`);
  }

  return bodyText;
}

// ── MCP 서버 정의 ─────────────────────────────────────────────
function createMcpServer() {
  const server = new McpServer({
    name: "discord-webhook-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "send_discord_message",
    {
      description: "사용자의 입력을 그대로 Discord로 전송하는 툴입니다",
      inputSchema: z.object({
        message: z.string().describe("보낼 메세지")
      })
    },

    async ({ message }) => {
      console.log("========================================");
      console.log("[DISCORD] 웹훅 전송 요청 접수:", message);

      try {
        await sendToDiscordQueued({ content: message });

        console.log("[DISCORD] ✅ 전송 성공");
        console.log("========================================");

        return {
          content: [
            {
              type: "text",
              text: `성공적으로 디스코드 채널에 메시지를 전송했습니다!\n전송된 메세지: ${message}`
            }
          ]
        };
      } catch (error) {
        console.error("[DISCORD] ❌ 전송 오류:", error);
        console.error("========================================");

        return {
          content: [
            {
              type: "text",
              text: `디스코드 웹훅 전송 중 오류가 발생했습니다:\n${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );

  return server;
}

const handler = createMcpHandler(createMcpServer);
const nodeHandler = toNodeHandler(handler);

const PORT = process.env.PORT || 3000;

createServer((req, res) => {
  console.log(`[SERVER] ${req.method} ${req.url}`);
  nodeHandler(req, res);
}).listen(PORT, "0.0.0.0", () => {
  console.log("========================================");
  console.log(`[SERVER] MCP Server running on port ${PORT}`);
  console.log("[SERVER] Discord Webhook MCP Ready");
  console.log("========================================");
});