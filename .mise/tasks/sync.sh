#!/usr/bin/env bash
#MISE description="Reconcile mypac's declared global Pi environment"
set -eo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd -P)"
desired_state="$root/.mise/global-environment"
mode="${1:-all}"

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

phases=()
managers=()
specifications=()
seen_components=""
while read -r phase manager specification extra; do
	if [[ -z "${phase:-}" || "$phase" == \#* ]]; then
		continue
	fi
	if [[ -z "${manager:-}" || -z "${specification:-}" || -n "${extra:-}" ]]; then
		echo "Error: invalid desired-state entry: $phase ${manager:-} ${specification:-} ${extra:-}" >&2
		exit 1
	fi
	case "$phase" in
		foundation|application|pi) ;;
		*) echo "Error: unknown desired-state phase: $phase" >&2; exit 1 ;;
	esac
	case "$manager" in
		mise|pi) ;;
		*) echo "Error: unknown desired-state manager: $manager" >&2; exit 1 ;;
	esac
	if [[ "$phase:$manager" != "foundation:mise" && "$phase:$manager" != "application:mise" && "$phase:$manager" != "pi:pi" ]]; then
		echo "Error: manager $manager is invalid for desired-state phase $phase" >&2
		exit 1
	fi
	if [[ ! "$specification" =~ @[0-9]+(\.[0-9]+)+$ ]]; then
		echo "Error: desired-state specification must have an exact version: $specification" >&2
		exit 1
	fi
	component="$manager ${specification%@*}"
	if grep -Fx -- "$component" <<< "$seen_components" >/dev/null; then
		echo "Error: duplicate desired-state component: $component" >&2
		exit 1
	fi
	seen_components+="$component"$'\n'
	phases+=("$phase")
	managers+=("$manager")
	specifications+=("$specification")
done < "$desired_state"

if [[ "$mode" == validate ]]; then
	exit 0
fi
case "$mode" in
	foundation|application|pi|setup|verify|all) ;;
	*) echo "Error: unknown sync operation: $mode" >&2; exit 1 ;;
esac

activate_mise() {
	local environment
	environment="$(mise env -s bash)"
	eval "$environment"
}

reconcile_mise_phase() {
	local requested_phase="$1" index
	require_command mise mise
	for index in "${!phases[@]}"; do
		if [[ "${phases[$index]}" == "$requested_phase" ]]; then
			mise use --global "${specifications[$index]}"
			activate_mise
		fi
	done
}

reconcile_pi() {
	local index
	require_command pi Pi
	for index in "${!phases[@]}"; do
		if [[ "${phases[$index]}" == pi ]]; then
			pi install "${specifications[$index]}"
		fi
	done
	pi install "$root"
}

setup_packages() {
	local specification index agent_browser_specification=""
	require_command mise mise
	activate_mise
	for index in "${!specifications[@]}"; do
		specification="${specifications[$index]}"
		if [[ "$specification" == npm:agent-browser@* ]]; then
			agent_browser_specification="$specification"
		fi
	done
	if [[ -n "$agent_browser_specification" ]]; then
		local screenshot_dir="$HOME/dev/agent-browser/screenshots"
		mkdir -p "$screenshot_dir"
		mise set --global "AGENT_BROWSER_SCREENSHOT_DIR=$screenshot_dir"
		activate_mise
		require_command agent-browser agent-browser
		agent-browser install
	fi
	for specification in "${specifications[@]}"; do
		if [[ "$specification" == npm:pi-agent-browser-native@* ]]; then
			require_command npm npm
			(
				cd "$HOME"
				npm exec --yes --package "${specification#npm:}" -- pi-agent-browser-doctor
			)
		fi
	done
}

verification_command() {
	local package="${1%@*}"
	case "$package" in
		aqua:max-sixty/worktrunk) echo wt ;;
		pipx:headroom-ai*) echo headroom ;;
		*) echo "${package##*[:/]}" ;;
	esac
}

require_mise_command() {
	local command="$1" version="$2" effective_path mise_path
	require_command "$command" "$command"
	effective_path="$(command -v "$command")"
	mise_path="$(mise which "$command")"
	if [[ "$effective_path" != "$mise_path" ]]; then
		echo "Error: $command must resolve to the mise-owned executable: $mise_path (got $effective_path)" >&2
		exit 1
	fi
	require_version "$command" "$version"
}

verify_environment() {
	local specification index pi_list command worktrunk_declared=false
	require_command mise mise
	require_command pi Pi
	activate_mise
	for index in "${!specifications[@]}"; do
		specification="${specifications[$index]}"
		if [[ "${managers[$index]}" == mise ]]; then
			command="$(verification_command "$specification")"
			require_mise_command "$command" "${specification##*@}"
			if [[ "$command" == node ]]; then
				# Node 24.20.0 supplies npm 11.19.0; verify it without reconciling a second npm installation.
				require_mise_command npm 11.19.0
			elif [[ "$command" == wt ]]; then
				worktrunk_declared=true
			fi
		fi
	done
	if [[ "$worktrunk_declared" == true ]]; then
		wt list --format=json >/dev/null
	fi
	pi_list="$(pi list --no-approve)"
	for index in "${!phases[@]}"; do
		if [[ "${phases[$index]}" == pi ]]; then
			grep -F -- "${specifications[$index]}" <<< "$pi_list" >/dev/null
		fi
	done
	grep -F -- "$root" <<< "$pi_list" >/dev/null
	pi --offline --no-approve --no-session --print </dev/null >/dev/null
	echo "Global Pi environment is in sync."
}

if [[ "$mode" == foundation || "$mode" == all ]]; then reconcile_mise_phase foundation; fi
if [[ "$mode" == application || "$mode" == all ]]; then reconcile_mise_phase application; fi
if [[ "$mode" == pi || "$mode" == all ]]; then reconcile_pi; fi
if [[ "$mode" == setup || "$mode" == all ]]; then setup_packages; fi
if [[ "$mode" == verify || "$mode" == all ]]; then verify_environment; fi
