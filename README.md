# SUSTech Blackboard

`obsidian-sustech-blackboard` is an Obsidian desktop plugin that keeps the Blackboard Phase 1 workflow inside a single custom `ItemView`.

## Phase 1 scope

The current plugin supports:

- loading Blackboard terms and courses from SUSTech CAS login
- viewing the current course content tree inside the ItemView
- downloading a single file on demand
- downloading the current course into a vault-relative destination folder while preserving the Blackboard directory hierarchy

## Interface

All Blackboard operations stay inside the current `ItemView`:

- username input
- password input for the current session only
- destination folder input
- course list browser
- single-file download buttons
- **Download current course** action

## Notes

- The plugin is desktop-only.
- Network requests are sent only to SUSTech CAS and Blackboard.
- Downloaded files are written inside the current vault.

## Development

```bash
npm install
npm test
npm run build
```
