#!/usr/bin/env bash
set -euo pipefail

: "${KC_BASE_URL:?Set KC_BASE_URL, for example http://localhost:8111}"
: "${KC_API_KEY:?Set KC_API_KEY to a full read,write API key}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

api_base="${KC_BASE_URL%/}"
auth_header="Authorization: Bearer ${KC_API_KEY}"
temporary_list_id=""

cleanup() {
  if [[ -n "${temporary_list_id}" ]]; then
    curl --silent --show-error --request DELETE \
      --header "${auth_header}" \
      "${api_base}/api/lists/${temporary_list_id}" >/dev/null || true
  fi
}
trap cleanup EXIT

curl --fail-with-body --silent --show-error "${api_base}/api/" | jq -e '.status == "ok"' >/dev/null
curl --fail-with-body --silent --show-error --header "${auth_header}" \
  "${api_base}/api/lists" | jq -e 'type == "array"' >/dev/null

created_list="$(curl --fail-with-body --silent --show-error --request POST \
  --header "${auth_header}" --header 'Content-Type: application/json' \
  --data '{"name":"API smoke-test list","description":"Automatically removed after verification"}' \
  "${api_base}/api/lists")"
temporary_list_id="$(jq -er '.id' <<<"${created_list}")"

created_item="$(curl --fail-with-body --silent --show-error --request POST \
  --header "${auth_header}" --header 'Content-Type: application/json' \
  --data '{"name":"API smoke-test item","quantity":1}' \
  "${api_base}/api/lists/${temporary_list_id}/items")"
item_id="$(jq -er '.id' <<<"${created_item}")"

curl --fail-with-body --silent --show-error --header "${auth_header}" \
  "${api_base}/api/lists/${temporary_list_id}/items" \
  | jq -e --arg item_id "${item_id}" 'any(.[]; .id == $item_id)' >/dev/null

echo "Kitchen Cupboard API smoke test passed."
