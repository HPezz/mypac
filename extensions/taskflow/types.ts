import type { ForgeReference, ForgeRepository } from "../../lib/forge.ts";

export type TaskTarget =
	| { kind: "iid"; iid: number }
	| { kind: "url"; reference: ForgeReference };

export type TaskIssue = {
	iid: number;
	title: string;
	description: string;
	state: string;
	labels: string[];
	assignees: string[];
	webUrl: string;
	updatedAt: string;
};

export type TaskBoard = {
	todo: TaskIssue[];
	doing: TaskIssue[];
	review: TaskIssue[];
	done: TaskIssue[];
};

export type TaskPointer = {
	repository: ForgeRepository;
	iid: number;
	webUrl: string;
	selectedAt: string;
};

export type GitStatus = {
	branch?: string;
	commit?: string;
};
