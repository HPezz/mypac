#!/usr/bin/env bash
#MISE description="Reconcile mypac's declared global Pi environment"
set -eo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd -P)"
desired_state="$root/.mise/global-environment"

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Error: $2 is required to sync mypac's global environment." >&2
		exit 1
	fi
}

require_version() {
	local output
	output="$("$1" --version)"
	if [[ "$output" != *"$2"* ]]; then
		echo "Error: expected $1 version $2, got: $output" >&2
		exit 1
	fi
}

require_command mise mise
require_command pi Pi

mise_tools=()
pi_packages=()
agent_browser_version=""
headroom_version=""
while read -r manager specification extra; do
	if [[ -z "${manager:-}" || "$manager" == \#* ]]; then
		continue
	fi
	if [[ -z "${specification:-}" || -n "${extra:-}" ]]; then
		echo "Error: invalid desired-state entry: $manager ${specification:-} ${extra:-}" >&2
		exit 1
	fi

	case "$manager" in
		mise)
			mise use --global "$specification"
			mise_environment="$(mise env -s bash)"
			eval "$mise_environment"
			mise_tools+=("$specification")
			if [[ "$specification" == npm:agent-browser@* ]]; then
				agent_browser_version="${specification##*@}"
			elif [[ "$specification" == pipx:headroom-ai* ]]; then
				headroom_version="${specification##*@}"
			fi
			;;
		pi)
			pi_packages+=("$specification")
			pi install "$specification"
			;;
		*)
			echo "Error: unknown desired-state manager: $manager" >&2
			exit 1
			;;
	esac
done < "$desired_state"

pi install "$root"

if [[ -n "$agent_browser_version" ]]; then
	screenshot_dir="$HOME/dev/agent-browser/screenshots"
	mkdir -p "$screenshot_dir"
	mise set --global "AGENT_BROWSER_SCREENSHOT_DIR=$screenshot_dir"
	mise_environment="$(mise env -s bash)"
	eval "$mise_environment"

	require_command agent-browser agent-browser
	agent-browser install
fi

for specification in "${mise_tools[@]}"; do
	if [[ "$specification" == uv@* ]]; then
		require_version uv "${specification#uv@}"
	fi
done
if [[ -n "$headroom_version" ]]; then
	require_command headroom Headroom
	require_version headroom "$headroom_version"
fi
if [[ -n "$agent_browser_version" ]]; then
	require_version agent-browser "$agent_browser_version"
fi

pi_list="$(pi list --no-approve)"
for specification in "${pi_packages[@]}"; do
	grep -F -- "$specification" <<< "$pi_list" >/dev/null
done
grep -F -- "$root" <<< "$pi_list" >/dev/null

for specification in "${pi_packages[@]}"; do
	if [[ "$specification" == npm:pi-agent-browser-native@* ]]; then
		require_command npm npm
		(
			cd "$HOME"
			npm exec --yes --package "${specification#npm:}" -- pi-agent-browser-doctor
		)
	fi
done

echo "Global Pi environment is in sync."
