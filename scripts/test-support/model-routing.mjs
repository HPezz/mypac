import http from "node:http";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";

export const HANG_RESPONSE = Symbol("hang-response");

export async function createModelServer(t, responses = []) {
	const requests = [];
	const pending = [...responses];
	let signalRequestReceived;
	const requestReceived = new Promise((resolve) => { signalRequestReceived = resolve; });
	const server = http.createServer((request, response) => {
		let body = "";
		request.on("data", (chunk) => { body += chunk; });
		request.on("end", () => {
			let parsedBody;
			try {
				parsedBody = body ? JSON.parse(body) : undefined;
			} catch {
				parsedBody = body;
			}
			requests.push({
				url: request.url,
				headers: request.headers,
				body: parsedBody,
			});
			signalRequestReceived();

			const configuredResponse = pending.shift();
			if (configuredResponse === HANG_RESPONSE) return;
			if (configuredResponse === undefined) {
				response.writeHead(500, { "content-type": "text/plain" });
				response.end("Unexpected model request");
				return;
			}

			response.writeHead(200, { "content-type": "text/event-stream" });
			for (const event of responseEvents(configuredResponse)) {
				response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
			}
			response.end("data: [DONE]\n\n");
		});
	});

	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise((resolve) => {
		server.close(resolve);
		server.closeAllConnections();
	}));

	const address = server.address();
	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		requests,
		requestReceived,
	};
}

export async function createCredentials(entries) {
	const credentials = new InMemoryCredentialStore();
	for (const [providerId, credential] of Object.entries(entries)) {
		await credentials.modify(providerId, async () => credential);
	}
	return credentials;
}

export function fakeOpenAiCodexCredential(accountId = "test-account") {
	const payload = Buffer.from(JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	})).toString("base64url");
	return {
		type: "oauth",
		refresh: "refresh-token",
		access: `header.${payload}.signature`,
		expires: Date.now() + 3_600_000,
	};
}

function responseEvents(text) {
	const message = {
		id: "message-1",
		type: "message",
		status: "completed",
		role: "assistant",
		content: [{ type: "output_text", text, annotations: [] }],
	};
	return [
		{
			type: "response.created",
			response: { id: "response-1", object: "response", created_at: 1, status: "in_progress", model: "test", output: [] },
		},
		{
			type: "response.output_item.added",
			output_index: 0,
			item: { ...message, status: "in_progress", content: [] },
		},
		{
			type: "response.content_part.added",
			item_id: message.id,
			output_index: 0,
			content_index: 0,
			part: { type: "output_text", text: "", annotations: [] },
		},
		{ type: "response.output_text.delta", item_id: message.id, output_index: 0, content_index: 0, delta: text },
		{ type: "response.output_text.done", item_id: message.id, output_index: 0, content_index: 0, text },
		{
			type: "response.content_part.done",
			item_id: message.id,
			output_index: 0,
			content_index: 0,
			part: message.content[0],
		},
		{ type: "response.output_item.done", output_index: 0, item: message },
		{
			type: "response.completed",
			response: {
				id: "response-1",
				object: "response",
				created_at: 1,
				status: "completed",
				model: "test",
				output: [message],
				usage: {
					input_tokens: 1,
					output_tokens: 1,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens_details: { reasoning_tokens: 0 },
				},
			},
		},
	];
}
