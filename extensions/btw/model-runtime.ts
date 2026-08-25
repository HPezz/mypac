import { ModelRuntime, type AgentSession, type ModelRegistry } from "@earendil-works/pi-coding-agent";

export async function setSideSessionModel(
	session: Pick<AgentSession, "thinkingLevel" | "setModel" | "setThinkingLevel">,
	model: Parameters<AgentSession["setModel"]>[0],
): Promise<void> {
	const thinkingLevel = session.thinkingLevel;
	await session.setModel(model);
	session.setThinkingLevel(thinkingLevel);
}

const mirroredRuntimeKeys = new WeakMap<ModelRuntime, Map<string, string>>();

export async function synchronizeModelRuntime(
	source: ModelRegistry,
	target: ModelRuntime,
	selectedProvider: string,
): Promise<void> {
	const sourceIds = [...source.getRegisteredProviderIds()];
	const targetIds = [...target.getRegisteredProviderIds()];
	const affectedIds = [...new Set([...targetIds, ...sourceIds])];

	for (const providerId of targetIds) {
		if (!sourceIds.includes(providerId)) {
			target.unregisterProvider(providerId);
		}
	}

	for (const providerId of sourceIds) {
		target.unregisterProvider(providerId);
		const nativeProvider = source.getRegisteredNativeProvider(providerId);
		if (nativeProvider) {
			target.registerNativeProvider(nativeProvider);
			continue;
		}

		const config = source.getRegisteredProviderConfig(providerId);
		if (config) {
			target.registerProvider(providerId, config);
		}
	}

	if (affectedIds.length > 0) {
		await target.refresh({ providers: affectedIds, allowNetwork: false });
	}

	const mirroredKeys = mirroredRuntimeKeys.get(target) ?? new Map<string, string>();
	mirroredRuntimeKeys.set(target, mirroredKeys);

	const [targetAuth, sourceAuth] = await Promise.all([
		target.getAuth(selectedProvider),
		source.getProviderAuth(selectedProvider),
	]);
	const sourceKey = sourceAuth?.auth.apiKey;
	const targetKey = targetAuth?.auth.apiKey;

	if (sourceKey && !targetKey) {
		await target.setRuntimeApiKey(selectedProvider, sourceKey);
		mirroredKeys.set(selectedProvider, sourceKey);
	} else if (sourceKey && mirroredKeys.has(selectedProvider) && sourceKey !== targetKey) {
		await target.setRuntimeApiKey(selectedProvider, sourceKey);
		mirroredKeys.set(selectedProvider, sourceKey);
	} else if (!sourceKey && mirroredKeys.has(selectedProvider)) {
		await target.removeRuntimeApiKey(selectedProvider);
		mirroredKeys.delete(selectedProvider);
	}
}

export async function createSynchronizedModelRuntime(
	source: ModelRegistry,
	selectedProvider: string,
): Promise<ModelRuntime> {
	const runtime = await ModelRuntime.create();
	await synchronizeModelRuntime(source, runtime, selectedProvider);
	return runtime;
}
