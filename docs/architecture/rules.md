# Rule Engine Documentation

## Rule File Format

Rules are defined in YAML files under the `rules/` directory. Each file is self-contained and can be enabled/disabled independently.

## Structure

```yaml
name: "rule-name"
description: "Human-readable description"
priority: 50              # Higher = executed first (default: 50)
tags: ["tag1", "tag2"]    # Optional tags for selective application

match:
  type: domain            # domain | path | always
  domains:               # List of domains to match
    - example.com
    - "*.example.com"     # Wildcard support
  paths:                 # Optional path patterns
    - "/{param1}/{param2}/{*rest}"
  pathMatch: prefix       # exact | prefix | regex (default: parameterized)

sources:                 # Optional: define fetch sources with fallback
  - name: "primary"
    type: "redirect"
    url: "https://other.com/{param1}"
    validate:
      status: [200]
      minLength: 50
  - name: "fallback"
    type: "original"

process:                 # Cleanup actions
  - when: "source == 'fallback'"  # Optional condition
    actions:
      - action: remove_until
        pattern: "^# "
        keepMatch: true
```

## Match Types

### Domain Matching
- Exact match: `example.com`
- Wildcard: `*.example.com` matches `sub.example.com`

### Path Matching
- Parameterized: `/{owner}/{repo}/blob/{branch}/{*path}`
  - `{name}` - matches single path segment
  - `{*name}` - greedy match (consumes remaining segments)
- Exact: `/exact/path`
- Prefix: `/prefix/` (with `pathMatch: prefix`)
- Regex: `/pattern.*/` (with `pathMatch: regex`)

## Actions

### remove_until
Remove content from start until pattern is found.

```yaml
- action: remove_until
  pattern: "^# "        # Regex pattern
  keepMatch: true        # Keep the matched line (default: false)
```

### remove_from
Remove content from pattern to end.

```yaml
- action: remove_from
  pattern: "^Footer"
  inclusive: false       # Don't include the matched line (default: false)
```

### remove_section
Remove a specific section.

```yaml
- action: remove_section
  from: "start"          # or a pattern
  to: "end"              # or a pattern
  fromInclusive: true
  toInclusive: false
```

### remove_lines_matching
Remove lines matching any of the patterns.

```yaml
- action: remove_lines_matching
  patterns:
    - "^\\[Sign in\\].*$"
    - "^Navigation$"
```

### remove_consecutive_links
Remove clusters of consecutive links (for index cleanup).

```yaml
- action: remove_consecutive_links
  threshold: 5           # Minimum consecutive links to remove
  maxInlineChars: 10     # Max non-link characters between links
  replacement: "[Removed {count} links]"
```

### redirect
Redirect to a different URL (used in sources).

```yaml
sources:
  - name: "raw"
    type: "redirect"
    url: "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
```

### replace
Simple text replacement.

```yaml
- action: replace
  pattern: "\\[¶\\]"
  replacement: ""
```

### mark
Mark content with a status (e.g., login required).

```yaml
- action: mark
  status: "login_required"
  message: "This site requires login"
```

## Conditional Processing

The `when` field supports simple conditions:

```yaml
process:
  - when: "source == 'github-html'"
    actions:
      # Only run when the 'github-html' source was used
```

## Tags

Tags allow selective application of rules:

```yaml
# In _link-cleanup.yaml
tags:
  - index_cleanup

# Applied only when fetch_web_markdown is called (not with_index)
```

## Fallback Chain

Sources are tried in order until one succeeds:

```yaml
sources:
  - name: "raw"
    type: "redirect"
    url: "..."
    validate:
      status: [200]
      minLength: 50
  - name: "original"
    type: "original"
```

If `raw` fails validation (wrong status or too short), it falls back to `original`.
