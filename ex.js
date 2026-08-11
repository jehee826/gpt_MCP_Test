import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";

function createMcpServer() {
  const server = new McpServer({
    name: "student-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "get_student_info",
    {
      description: "학생의 정보를 조회할 때 사용하는 Tool입니다.",
      inputSchema: z.object({
        name: z.string().describe("조회할 학생의 이름")
      })
    },

    async ({ name }) => {
      // MCP 내부에 직접 저장된 예제 데이터
      const student = {
        name: name,
        major: "컴퓨터소프트웨어과",
        grade: 2,
        interests: ["AI", "웹 개발", "MCP"]
      };

      return {
        content: [
          {
            type: "text",
            text: `
학생 정보:
${JSON.stringify(student)}

위 정보를 바탕으로 학생을 자연스럽게 소개해주세요.
`
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