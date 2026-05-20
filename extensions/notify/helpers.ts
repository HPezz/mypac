import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";

export type NotifyMessage = {
	role?: string;
	content?: unknown;
};

const isTextPart = (part: unknown): part is { type: "text"; text: string } =>
	Boolean(
		part &&
			typeof part === "object" &&
			"type" in part &&
			part.type === "text" &&
			"text" in part &&
			typeof part.text === "string",
	);

export function extractLastAssistantText(messages: NotifyMessage[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant") {
			continue;
		}

		const content = message.content;
		if (typeof content === "string") {
			const text = content.trim();
			if (text) {
				return text;
			}
			continue;
		}

		if (Array.isArray(content)) {
			const text = content
				.filter(isTextPart)
				.map((part) => part.text)
				.join("\n")
				.trim();
			if (text) {
				return text;
			}
			continue;
		}

		continue;
	}

	return null;
}

const plainMarkdownTheme: MarkdownTheme = {
	heading: (text) => text,
	link: (text) => text,
	linkUrl: () => "",
	code: (text) => text,
	codeBlock: (text) => text,
	codeBlockBorder: () => "",
	quote: (text) => text,
	quoteBorder: () => "",
	hr: () => "",
	listBullet: () => "",
	bold: (text) => text,
	italic: (text) => text,
	strikethrough: (text) => text,
	underline: (text) => text,
};

function wrapPlainText(text: string, width: number): string {
	return text
		.split("\n")
		.flatMap((line) => {
			if (!line) return [""];
			const wrapped: string[] = [];
			for (let i = 0; i < line.length; i += width) {
				wrapped.push(line.slice(i, i + width));
			}
			return wrapped.length > 0 ? wrapped : [""];
		})
		.join("\n");
}

function simpleMarkdown(text: string, width = 80): string {
	try {
		const markdown = new Markdown(text, 0, 0, plainMarkdownTheme);
		return markdown.render(width).join("\n");
	} catch {
		return wrapPlainText(text, width);
	}
}

export function formatNotification(text: string | null): { title: string; body: string } {
	const simplified = text ? simpleMarkdown(text) : "";
	const normalized = simplified.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return { title: "Ready for input", body: "" };
	}

	const maxBody = 200;
	const body = normalized.length > maxBody ? `${normalized.slice(0, maxBody - 1)}…` : normalized;
	return { title: "π", body };
}

type NotifyEnv = Partial<
	Pick<NodeJS.ProcessEnv, "ITERM_SESSION_ID" | "KITTY_WINDOW_ID" | "TERM_PROGRAM" | "TMUX">
>;

function wrapForTmux(sequence: string, env: NotifyEnv): string {
	if (!env.TMUX) {
		return sequence;
	}

	const escaped = sequence.split("\x1b").join("\x1b\x1b");
	return `\x1bPtmux;${escaped}\x1b\\`;
}

function sanitizeNotificationField(value: string): string {
	return value.replace(/[\x00-\x1f\x7f]/g, "").replace(/;/g, ",");
}

export function formatTerminalNotification(title: string, body: string, env: NotifyEnv = process.env): string {
	const safeTitle = sanitizeNotificationField(title);
	const safeBody = sanitizeNotificationField(body);

	if (env.KITTY_WINDOW_ID) {
		const titleSequence = `\x1b]99;i=1:d=0;${safeTitle}\x1b\\`;
		const bodySequence = `\x1b]99;i=1:p=body;${safeBody}\x1b\\`;
		return wrapForTmux(titleSequence, env) + wrapForTmux(bodySequence, env);
	}

	if (env.TERM_PROGRAM === "iTerm.app" || env.ITERM_SESSION_ID) {
		const message = safeBody ? `${safeTitle}: ${safeBody}` : safeTitle;
		return wrapForTmux(`\x1b]9;${message}\x07`, env);
	}

	return wrapForTmux(`\x1b]777;notify;${safeTitle};${safeBody}\x07`, env);
}
