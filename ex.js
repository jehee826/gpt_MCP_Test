import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";

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

      // Discord Webhook URL
      const webhookUrl =
        "https://discord.com/api/webhooks/1539151554425262211/dFkR738jAESNhr5V4uCuTdmKZnSRdNx7wF_n6YH6YEdC7EtmNIYiCcjTCNuy3CDb2SFt";

      const discordPayload = {
        content: message
      };

      try {
        console.log("========================================");
        console.log("[DISCORD] 웹훅 전송 시작");
        console.log("[DISCORD] message:", message);
        console.log("[DISCORD] payload:", JSON.stringify(discordPayload));

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(discordPayload)
        });

        // Discord의 실제 응답 내용 확인
        const responseText = await response.text();

        console.log("[DISCORD] HTTP Status:", response.status);
        console.log("[DISCORD] Status Text:", response.statusText);
        console.log("[DISCORD] Response Body:", responseText);

        // Rate Limit인 경우 별도로 분석
        if (response.status === 429) {
          console.error("[DISCORD] ⚠️ RATE LIMIT 발생");

          try {
            const rateLimitData = JSON.parse(responseText);

            console.error(
              "[DISCORD] retry_after:",
              rateLimitData.retry_after
            );

            console.error(
              "[DISCORD] global:",
              rateLimitData.global
            );

            console.error(
              "[DISCORD] message:",
              rateLimitData.message
            );
          } catch (parseError) {
            console.error(
              "[DISCORD] Rate Limit 응답 JSON 파싱 실패:",
              parseError
            );
          }
        }

        if (!response.ok) {
          throw new Error(
            `디스코드 전송 실패: HTTP ${response.status} ${response.statusText} / ${responseText}`
          );
        }

        console.log("[DISCORD] ✅ 전송 성공");
        console.log("========================================");

        return {
          content: [
            {
              type: "text",
              text:
                `성공적으로 디스코드 채널에 메시지를 전송했습니다!\n` +
                `전송된 메세지: ${message}`
            }
          ]
        };

      } catch (error) {

        console.error("========================================");
        console.error("[DISCORD] ❌ 전송 오류 발생");
        console.error("[DISCORD] Error:", error);

        if (error instanceof Error) {
          console.error("[DISCORD] Error Message:", error.message);
          console.error("[DISCORD] Stack:", error.stack);
        }

        console.error("========================================");

        return {
          content: [
            {
              type: "text",
              text:
                `디스코드 웹훅 전송 중 오류가 발생했습니다:\n` +
                `${error instanceof Error ? error.message : String(error)}`
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