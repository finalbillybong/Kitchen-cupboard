# Community Apps submission

Kitchen Cupboard uses a standard Docker template with a published image. Submit the application repository directly; a separate template repository or Compose package is not required for this setup.

| Field | Value |
| --- | --- |
| Repository | `https://github.com/finalbillybong/Kitchen-cupboard` |
| Branch | `main` |
| App template | [`unraid/kitchen-cupboard.xml`](../unraid/kitchen-cupboard.xml) |
| Repository profile | [`ca_profile.xml`](../ca_profile.xml) |
| Licence | [MIT](../LICENSE) |
| Image | `finalbillybong/kitchen-cupboard:latest` |
| Platform | `linux/amd64` (x86-64) |
| Release status | Beta; `latest` follows image builds from `main` |
| Support | [GitHub Issues](https://github.com/finalbillybong/Kitchen-cupboard/issues) |

## Before review

1. Publish the README, licence, profile and template on `main` so the submission service can fetch them. Keep the repository public and active.
2. Check the Test and Docker image workflows for the published commit. The workflows run independently, so an image build alone does not establish that tests passed.
3. Open [Community Apps Submit](https://ca.unraid.net/submit/new) in your browser and complete any sign-in requested by the site. Enter the repository URL above.
4. Run **Validate**, then **Scan**. Resolve any reported issues and rerun both after meaningful XML changes.
5. Check the preview for the application name, icon, support link, beta marker and configuration fields, then submit for review once the portal checks pass.

XML parsing and local metadata checks do not replace Community Apps' own validation, scan or moderation. The portal returned HTTP 403 to the preparation environment; no portal validation, scan or submission has been completed by that environment.

## Installation checks

Use a fresh, disposable appdata directory and an unused host port when checking a new installation. Enter a unique random Secret Key of at least 32 characters, set Public URL to the reachable app URL, and keep Registration Enabled false. Verify startup, first-account admin registration, subsequent invite-only registration, recipe/planner/shopping use, and persistence after container recreation. Do not reuse an existing household's appdata for a clean-install check.

The template uses version 2 `Config` entries for port `8000`, appdata at `/app/data`, and environment variables. The secret is intentionally empty and required; it is never supplied as a shared template default. Optional internal integration hosts are exposed in advanced settings. Browser PWA installation and service-worker offline use require HTTPS, except on localhost.

## Maintaining the listing

Keep the template's overview, beta marker, image reference and configuration descriptions aligned with the app. Keep `TemplateURL` pointed at the exact raw XML location, and retain working icon, README and support links. Update the root repository profile if ownership or support arrangements change.

References: [submission help](https://ca.unraid.net/submit/help), [repository profile rules](https://ca.unraid.net/submit/help/repository-info-xml), [XML field reference](https://ca.unraid.net/submit/help/xml-field-reference), and the [official starter repository](https://github.com/unraid/unraid-community-apps-starter).
