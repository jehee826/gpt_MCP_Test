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

      const webhookUrl = "https://discord.com/api/webhooks/1539143911895990344/WtS1EwSZhyT7t47Zwvn7hrOglu2M56pk2pflzvlF2loI5l_jGDJR8a-xk2HbniMWMl4b";

      const discordPayload = {
        content: message
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(discordPayload)
        });

        if (!response.ok) {
          throw new Error(`디스코드 전송 실패: ${response.statusText}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `디스코드 웹훅 전송 중 오류가 발생했습니다: ${error.message}`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `성공적으로 디스코드 채널에 메시지를 전송했습니다!\n전송된 메세지: ${message}`
          }
        ]
      };
    }
  );

  return server;
}

const handler = createMcpHandler(createMcpServer);
const nodeHandler = toNodeHandler(handler);

const PORT = process.env.PORT || 3000;

createServer((req, res) => {
  nodeHandler(req, res);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`MCP Server running on port ${PORT}`);
});