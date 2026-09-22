# Open-source preparation — 21 September 2026

This copy contains an MIT license, contribution/security guidance, issue and
pull-request templates, a proposed roadmap and a Node 24 test workflow.
No GitHub repository or program acceptance is implied by these files.

Validation: Lootkip 36 automated tests and 12 native ad-frequency checks passed;
ZERO 25 automated tests passed. Lootkip's bundle was regenerated and checked.
ZERO's frontend syntax and shared-engine consistency were checked. A targeted
credential-pattern scan found no matches. This is not an exhaustive security audit.
No Android APK was rebuilt and no physical-device match was tested in this pass.
GitHub Actions have not yet run.

Public-copy changes: Lootkip uses test ad IDs in both build variants and omits
historical private-environment verification logs. ZERO replaces the original
backend hostname across its API endpoint, CSP and native allowlist with a
configuration placeholder; unconfigured online requests show a clear error.
Original signing backups and live backend data are not included or changed.

Program guidance: https://openai.com/form/codex-for-oss/
Selection considers active maintenance, usage and ecosystem importance. New
repositories alone do not ensure acceptance. Report only real users, downloads,
stars, maintenance activity and completed validation in any application.
